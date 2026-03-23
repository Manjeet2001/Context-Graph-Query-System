# Context Graph Query System (SAP Order-to-Cash)

This application is a Graph-Based Data Modeling and Query System built for the SAP Order-to-Cash dataset. It combines a dynamic force-directed graph visualization with an LLM-powered natural language query interface, effectively tracking Orders through Deliveries, Invoices, and Payments.

## Live Demo
- **Frontend App**: [https://frontend-production-bfd6.up.railway.app/](https://frontend-production-bfd6.up.railway.app/)
- **Backend API**: [https://dodge-backend-production.up.railway.app/](https://dodge-backend-production.up.railway.app/)

## 1. Architecture Decisions

The system is built with a decoupled client-server architecture to ensure scalability and separation of concerns:

- **Backend (FastAPI & Python)**: The backend provides REST API endpoints for handling chat queries and generating subgraph data. It manages the LLM integration, database execution, and prompt construction. FastAPI was selected for its high performance and async capabilities.
- **Frontend (React + Vite + Tailwind CSS)**: The web interface uses a split-pane design that mirrors enterprise investigation tools. It uses `react-force-graph-2d` (HTML5 Canvas) for high-performance rendering of the knowledge graph (handling thousands of nodes dynamically without freezing the DOM).
- **Dynamic Graph Modeling**: Instead of maintaining a static graph DB, we model the graph dynamically. When the frontend asks for the neighborhood of a specified Node (e.g., Sales Order `740506`), the FastAPI backend executes rapid SQL `JOIN`s, constructing the Nodes and Edges on the fly to send back to the React client.

### Data Flow

```text
User Query
    |
    v
+-------------------------+
|     API / Backend       | <- FastAPI (main.py)
|    (POST /api/chat)     |
+-------------------------+
    | schema + query
    v
+-------------------------+
|       SQL Agent         | <- Groq (llama-3.3-70b) + System Guardrails
|     (generate_sql)      |
+-------------------------+
    | SQLite Query (or 'REJECT')
    v
+-------------------------+
|     Data Retrieval      | <- SQLite (o2c.db)
|      (execute_sql)      |
+-------------------------+
    | raw JSON results
    v
+-------------------------+
|    Answer Generator     | <- Groq (llama-3.1-8b)
|  (format_final_answer)  |
+-------------------------+
    |
    v
Natural Language Answer + Structured Data -> React UI
```

## 2. Database Choice: SQLite

We chose **SQLite** as the core database engine to store the 138MB JSONL dataset (`o2c.db`).

- **Why SQLite**: SQLite is lightweight, requires zero manual server setup, and parses relational data perfectly. More importantly, it is the absolute best format for **Text-to-SQL LLM tasks**. Relational databases are significantly easier for LLMs to generate queries against compared to complex graph traversal languages.
- **Alternative Considered (Graph Database)**: We considered native Graph Databases like Neo4j. While Neo4j is great for traversals, it introduces significant overhead for setup and inference. Text-to-Cypher (Neo4j's query language) is generally less reliable than Text-to-SQL for most open-weight or fast LLMs. By using SQLite, we preserve SQL's reliability while dynamically assembling graph structures on the backend.

## 3. LLM Prompting Strategy

We utilize **Groq** for its blazingly fast inference speeds, providing a real-time conversational experience. Our strategy employs a robust two-step LLM pipeline to ensure accuracy and user-friendly responses:

1. **Text-to-SQL Generation (`llama-3.3-70b-versatile`)**:
   - When a user asks a question, the backend retrieves the full SQLite database schema and injects it into a rigorous system prompt.
   - **Schema Injection**: The prompt includes the exact tables and columns to ground the model.
   - **Relationship Guidance**: We provide explicit instructions on how tables relate (e.g., Flow Trace: Sales Order -> Delivery -> Billing -> Journal Entry) and how to handle specific edge cases like "broken flows" using `LEFT JOIN`s.
   - The LLM's only task at this step is to output a single, raw, and valid SQLite query. No conversational filler is allowed.

2. **Answer Formatting (`llama-3.1-8b-instant`)**:
   - The backend executes the generated SQL query locally against the SQLite database.
   - The raw JSON results (capped at 50 records), the original user query, and the executed SQL are passed to a second, smaller foundational model.
   - This model acts as a helpful assistant, interpreting the raw database results and formatting them into a clear, concise natural language answer for the user, prominently displaying relevant IDs (like Sales Order or Billing Document IDs).

## 4. Guardrails

To prevent hallucinations, prompt injection, or out-of-scope responses ("jailbreaks"), strict guardrails are enforced at the very first step of the LLM pipeline:

- **Strict Prompt Instructions**: The Text-to-SQL system prompt explicitly instructs the LLM: *"If the user's prompt is a general knowledge question, creative writing request, or unrelated to business/sales/Order-to-Cash, you MUST output EXACTLY and ONLY the word 'REJECT'."*
- **Hardcoded Intervention**: The backend intercepts the LLM's raw output before it executes any queries against the database. If the output string starts with `"REJECT"`, the system short-circuits the pipeline and skips database execution.
- **Standardized Refusal Message**: The user is immediately returned a safe, hardcoded response: *"This system is designed to answer questions related to the provided dataset only."*
- **SQL Execution Sandbox**: All SQL executions are wrapped in `try-except` blocks. If an invalid SQL query is generated or if an error occurs during execution, an isolated error message is gracefully returned rather than crashing the backend server.

## Bonus Features Implemented
1. **Natural Language to SQL**: Core mechanism that translates dynamic questions into accurate data lookups without hardcoded routes.
2. **Conversation Memory**: Chat history is maintained seamlessly between turns.
3. **Highlighting Nodes**: When the LLM outputs a specific entity ID, the Frontend parses this and dynamically requests that specific neighborhood from the graph API, highlighting that flow on the canvas.

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- A `.env` file in the root directory with your `GROQ_API_KEY=your_key_here`

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/Scripts/activate
pip install -r requirements.txt

# Run the ingestion script to create o2c.db from the raw dataset
python ingest_data.py

# Start the FastAPI server
python -m uvicorn main:app --reload
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Navigate to `http://localhost:5173` to explore the application!
