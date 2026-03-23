import os
import json

base_dir = "dataset/sap-o2c-data"
schemas = {}

for folder in sorted(os.listdir(base_dir)):
    folder_path = os.path.join(base_dir, folder)
    if os.path.isdir(folder_path):
        for file in os.listdir(folder_path):
            if file.endswith(".jsonl"):
                file_path = os.path.join(folder_path, file)
                with open(file_path, "r", encoding="utf-8") as f:
                    try:
                        first_line = f.readline()
                        data = json.loads(first_line)
                        schemas[folder] = list(data.keys())
                    except Exception as e:
                        schemas[folder] = f"Error: {e}"
                break

with open("dataset_schema.json", "w", encoding="utf-8") as f:
    json.dump(schemas, f, indent=2)

print("Schema extracted and saved to dataset_schema.json")
