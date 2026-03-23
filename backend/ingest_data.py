import os
import json
import sqlite3
import pandas as pd

DB_PATH = "o2c.db"
DATASET_DIR = "../dataset/sap-o2c-data"

def infer_sqlite_type(value):
    if isinstance(value, bool):
        return "BOOLEAN"
    elif isinstance(value, int):
        return "INTEGER"
    elif isinstance(value, float):
        return "REAL"
    else:
        return "TEXT"

def create_table_from_schema(conn, table_name, schema_dict):
    cursor = conn.cursor()
    columns = []
    for key, val in schema_dict.items():
        sql_type = infer_sqlite_type(val)
        columns.append(f'"{key}" {sql_type}')
    
    columns_str = ",\n    ".join(columns)
    create_stmt = f"CREATE TABLE IF NOT EXISTS {table_name} (\n    {columns_str}\n);"
    cursor.execute(create_stmt)
    conn.commit()

def process_directory(conn, folder_path, table_name):
    print(f"Processing {table_name}...")
    cursor = conn.cursor()
    
    cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'")
    if cursor.fetchone():
        print(f"Table {table_name} already exists, dropping it to recreate.")
        cursor.execute(f"DROP TABLE {table_name}")
    
    files = [f for f in sorted(os.listdir(folder_path)) if f.endswith(".jsonl")]
    if not files:
        print(f"No JSONL files found in {folder_path}")
        return
    first_file = os.path.join(folder_path, files[0])
    schema_dict = {}
    with open(first_file, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i > 1000: break
            if not line.strip(): continue
            data = json.loads(line)
            flat_data = flatten_dict(data)
            for k, v in flat_data.items():
                if k not in schema_dict or schema_dict[k] is None:
                    schema_dict[k] = v

    create_table_from_schema(conn, table_name, schema_dict)
    schema_keys = list(schema_dict.keys())

    total_inserted = 0
    for file in files:
        file_path = os.path.join(folder_path, file)
        with open(file_path, "r", encoding="utf-8") as f:
            batch = []
            for line in f:
                if not line.strip(): continue
                data = json.loads(line)
                flat_data = flatten_dict(data)
                
                for k, v in flat_data.items():
                    if isinstance(v, (list, dict)):
                        flat_data[k] = json.dumps(v)
                
                batch.append(flat_data)
                
                if len(batch) >= 5000:
                    insert_batch(cursor, table_name, schema_keys, batch)
                    batch = []
                    total_inserted += 5000
            
            if batch:
                insert_batch(cursor, table_name, schema_keys, batch)
                total_inserted += len(batch)
    
    conn.commit()
    print(f"Inserted {total_inserted} records into {table_name}.")

def flatten_dict(d, parent_key='', sep='_'):
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)

def insert_batch(cursor, table_name, schema_keys, batch):
    if not batch: return
    columns = ", ".join([f'"{k}"' for k in schema_keys])
    placeholders = ", ".join(["?"] * len(schema_keys))
    
    insert_stmt = f"INSERT INTO {table_name} ({columns}) VALUES ({placeholders})"
    
    data_tuples = []
    for row in batch:
        data_tuples.append(tuple(row.get(k, None) for k in schema_keys))
        
    try:
        cursor.executemany(insert_stmt, data_tuples)
    except sqlite3.OperationalError as e:
        print(f"Error inserting into {table_name}: {e}")
        pass

def main():
    conn = sqlite3.connect(DB_PATH)
    
    for item in sorted(os.listdir(DATASET_DIR)):
        item_path = os.path.join(DATASET_DIR, item)
        if os.path.isdir(item_path):
            process_directory(conn, item_path, item)
            
    conn.close()
    print("Data ingestion complete. DB saved to", DB_PATH)

if __name__ == "__main__":
    main()
