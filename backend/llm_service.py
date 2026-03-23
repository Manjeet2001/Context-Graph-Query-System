import os
import sqlite3
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
DB_PATH = "o2c.db"

def get_db_schema():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    
    schema_lines = []
    for table_tuple in tables:
        table_name = table_tuple[0]
        cursor.execute(f"PRAGMA table_info({table_name});")
        columns = [row[1] for row in cursor.fetchall()]
        schema_lines.append(f"Table: {table_name} | Columns: {', '.join(columns)}")
        
    conn.close()
    return "\n".join(schema_lines)

def execute_sql(query):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute(query)
        columns = [description[0] for description in cursor.description] if cursor.description else []
        results = cursor.fetchall()
        output = []
        for row in results:
            output.append(dict(zip(columns, row)))
        return output, None
    except Exception as e:
        return None, str(e)
    finally:
        conn.close()

import re

def generate_sql(user_query, schema):
    if len(schema) > 20000:
        schema = schema[:20000] + "\n... (truncated)"
        
    system_prompt = f"""
You are an expert SQL assistant for an SAP Order-to-Cash database. 
You must ONLY output valid SQLite SQL code, nothing else. No markdown, no explanations, JUST the pure SQL query.

CRITICAL GUARDRAIL: If the user's prompt is a general knowledge question, creative writing request, or unrelated to business/sales/Order-to-Cash, you MUST output EXACTLY and ONLY the word 'REJECT'. Otherwise, write a query. Do NOT refuse to answer Order-to-Cash questions.

Here is the SQLite schema:
{schema}

Relationships guidance (CRITICAL):
- 'Customers' or 'customer_id' refers to `soldToParty` in `sales_order_headers`.
- Product or Material refers to `material` in `sales_order_items`.
- Flow Trace: Sales Order (`salesOrder` in `sales_order_headers`) -> Delivery (`referenceDocument`=`salesOrder` in `outbound_delivery_items`) -> Billing (`salesDocument`=`salesOrder` in `billing_document_items`) -> Journal Entry (`referenceDocument`=`billingDocument` in `journal_entry_items_accounts_receivable`).
- To link Products to Billing: JOIN `sales_order_items` with `billing_document_items` ON `sales_order_items.salesOrder` = `billing_document_items.salesDocument`. Group by `material` to count billing documents.
- For "broken or incomplete flows" (e.g. delivered but not billed): use LEFT JOINs or WHERE NOT EXISTS checking the Flow Trace sequence.
- Provide user-friendly column aliases.

Formulate an SQL query to answer the user's question: '{user_query}'
"""
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile", 
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_query}
            ],
            temperature=0,
            max_tokens=600
        )
        sql = response.choices[0].message.content.strip()
        print(f"DEBUG LLM Raw SQL Generated: {sql}")
        if "```sql" in sql:
            match = re.search(r'```sql(.*?)```', sql, re.DOTALL)
            if match:
                sql = match.group(1).strip()
        elif "```" in sql:
            match = re.search(r'```(.*?)```', sql, re.DOTALL)
            if match:
                sql = match.group(1).strip()
                
        return sql.strip()
    except Exception as e:
        print(f"Error generating SQL: {e}")
        return f"ERROR: {e}"

def format_final_answer(user_query, sql_query, sql_results):
    system_prompt = f"""
You are a helpful assistant interpreting database results for a user querying an Order-to-Cash system.
The user asked: '{user_query}'
The SQL query executed was: '{sql_query}'
The results were: {json.dumps(sql_results[:50])}

Explain the results clearly and concisely in natural language.
If the results contain IDs (like Sales Order ID, Billing Document ID), display them prominently.
Do not mention the SQL query itself to the user, just answer their question based on the data.
"""
    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "Please explain the results."}
            ],
            temperature=0.3,
            max_tokens=1000
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"Error formatting response: {e}"

def process_chat(user_message, history=None):
    schema = get_db_schema()
    sql_query = generate_sql(user_message, schema)
    
    print(f"DEBUG SQL QUERY: {sql_query}")
    
    if sql_query and sql_query.upper().startswith("REJECT"):
        return {
            "answer": "This system is designed to answer questions related to the provided dataset only.",
            "sql": None,
            "data": None
        }
    
    if sql_query and sql_query.startswith("ERROR:"):
        return {
            "answer": f"I hit an internal LLM exception: {sql_query}",
            "sql": None,
            "data": None
        }
        
    if not sql_query:
        return {
            "answer": f"I failed to generate a valid SQL query. Raw output: {sql_query}",
            "sql": None,
            "data": None
        }
    results, error = execute_sql(sql_query)
    
    if error:
        return {
            "answer": f"I couldn't execute the query correctly. SQL Error: {error}",
            "sql": sql_query,
            "data": None
        }
    final_answer = format_final_answer(user_message, sql_query, results)
    
    return {
        "answer": final_answer,
        "sql": sql_query,
        "data": results[:100]
    }
