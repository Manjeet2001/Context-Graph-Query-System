from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
import networkx as nx
import os
from llm_service import process_chat

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "o2c.db"
print("DB PATH:", DB_PATH)
print("DB exists:", os.path.exists(DB_PATH))

class ChatRequest(BaseModel):
    message: str
    history: list = []

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    response_data = process_chat(req.message, req.history)
    return {"response": response_data}

@app.get("/api/graph")
async def get_graph(node_id: str = None):
    print("Inside /api/graph")
    print("DB exists:", os.path.exists(DB_PATH))
    """
    Returns a graph neighborhood around a specified node_id, or a global summary graph.
    If no node_id is provided, might return an overview (e.g., 50 random nodes).
    For true neighborhood search, we write SQL joins or NetworkX paths.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # We will build a simple generalization
    nodes = []
    edges = []
    
    if node_id:
        cursor.execute("SELECT salesOrder, soldToParty FROM sales_order_headers WHERE salesOrder = ? LIMIT 1", (node_id,))
        so = cursor.fetchone()
        
        if so:
            so_id, customer_id = so
            nodes.append({"id": so_id, "label": f"SO {so_id}", "group": 1})
            nodes.append({"id": customer_id, "label": f"Customer {customer_id}", "group": 2})
            edges.append({"source": customer_id, "target": so_id, "label": "Ordered"})
            cursor.execute("SELECT salesOrderItem, material FROM sales_order_items WHERE salesOrder = ?", (so_id,))
            for item in cursor.fetchall():
                item_id = f"{so_id}-{item[0]}"
                nodes.append({"id": item_id, "label": "SO Item", "group": 3})
                nodes.append({"id": item[1], "label": f"Product {item[1]}", "group": 4})
                edges.append({"source": so_id, "target": item_id, "label": "Contains"})
                edges.append({"source": item_id, "target": item[1], "label": "Is Product"})
            cursor.execute("SELECT outboundDelivery FROM outbound_delivery_items WHERE referenceDocument = ?", (so_id,))
            for delivery in cursor.fetchall():
                del_id = delivery[0]
                nodes.append({"id": del_id, "label": f"Delivery {del_id}", "group": 5})
                edges.append({"source": so_id, "target": del_id, "label": "Delivered By"})
            cursor.execute("SELECT billingDocument FROM billing_document_items WHERE salesDocument = ?", (so_id,))
            for bill in cursor.fetchall():
                bill_id = bill[0]
                nodes.append({"id": bill_id, "label": f"Billing {bill_id}", "group": 6})
                edges.append({"source": so_id, "target": bill_id, "label": "Billed In"})
                
    if not nodes:
        cursor.execute('''
            SELECT soldToParty, COUNT(salesOrder) as order_count 
            FROM sales_order_headers 
            GROUP BY soldToParty 
            ORDER BY order_count DESC 
            LIMIT 3
        ''')
        top_customers = cursor.fetchall()
        for cust in top_customers:
            cust_id = cust[0]
            nodes.append({"id": cust_id, "label": f"Customer {cust_id}", "group": 2})
            cursor.execute("SELECT salesOrder FROM sales_order_headers WHERE soldToParty = ? LIMIT 60", (cust_id,))
            orders = cursor.fetchall()
            for o in orders:
                so_id = o[0]
                nodes.append({"id": so_id, "label": f"SO {so_id}", "group": 1})
                edges.append({"source": cust_id, "target": so_id, "label": "Ordered"})
                cursor.execute("SELECT salesOrderItem, material FROM sales_order_items WHERE salesOrder = ? LIMIT 3", (so_id,))
                items = cursor.fetchall()
                for item in items:
                    item_id = f"{so_id}-{item[0]}"
                    nodes.append({"id": item_id, "label": "SO Item", "group": 3})
                    nodes.append({"id": item[1], "label": "Product", "group": 4})
                    edges.append({"source": so_id, "target": item_id, "label": "Contains"})
                    edges.append({"source": item_id, "target": item[1], "label": "Is Product"})
            
    conn.close()
    seen_nodes = set() 
    unique_nodes = [] 
    for n in nodes: 
        if n["id"] not in seen_nodes: 
            seen_nodes.add(n["id"]) 
            unique_nodes.append(n) 
    return {"nodes": unique_nodes, "links": edges}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)