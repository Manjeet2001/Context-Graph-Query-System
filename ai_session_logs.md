# AI Coding Session Logs: Antigravity

This document outlines the AI-assisted development process for the **Context Graph Query System (SAP Order-to-Cash)**. Rather than a raw chat transcript, this file summarizes the architectural decisions, prompts, and iterative problem-solving workflow utilized during development.

## 1. The Tool and Workflow

**Tool Used:** Claude Code, Groq AI for LLM API key, and Google DeepMind's Antigravity (Agentic AI Coding Assistant).

**Overall Workflow:** 
Claude was used for initial research and development of the application, also for architectural decisions. Antigravity was utilized for the main development of this application. Instead of writing boilerplate code from scratch, I focused my manual effort on refining the system architecture, specifically the Text-to-SQL capabilities and the dynamic graph logic. 

The typical cycle involved:
1. Providing the AI with screenshots and schema definitions of the 138MB SAP Order-to-Cash dataset (`dataset_schema.json`).
2. Prompting the AI to generate structural boilerplate (FastAPI endpoints, React component trees).
3. Iteratively refining the "glue" logic—such as parsing LLM SQL output and mapping it to the `react-force-graph-2d` canvas.

## 2. Iterative Development & Bug Fixing

Building a reliable Text-to-SQL graph system required multiple iterations to get the prompts and performance right. Below are the key debugging cycles executed alongside the AI:

### Iteration 1: Database Architecture Pivot
* **Initial Prompt:** "I want to build a graph visualization for SAP data. Should I ingest this JSONL file into Neo4j and use an LLM to write Cypher queries?"
* **The AI Discussion:** We evaluated the overhead of Neo4j/Cypher for fast inference. We discovered that open-weight LLMs (like Llama 3) generate SQL much more reliably than Cypher. 
* **The Fix:** I instructed the AI: *"Let's use SQLite instead. Write an `ingest_data.py` script to map the Order-to-Cash JSONL to relational tables (`o2c.db`). We will dynamically construct the graph edges in FastAPI by running SQL JOINs when a user asks a question."*

### Iteration 2: Groq Model Deprecation Error
* **The Bug:** During API testing, the graph stopped rendering. The backend generated an `out.json` file logging a `400: model_decommissioned` error.
* **The Prompt:** "FastAPI is failing during the SQL generation step. The error is `The model llama3-70b-8192 has been decommissioned`. What models should we upgrade to for the two-step pipeline?"
* **The Fix:** We migrated the Text-to-SQL agent to `llama-3.3-70b-versatile` (for higher accuracy on complex queries) and the Answer Formatter to `llama-3.1-8b-instant` (for speed).

### Iteration 3: Frontend Canvas Performance
* **The Bug:** Rendering large SAP supplier networks caused React to crash because DOM-based SVG mapping was too slow for the graph.
* **The Prompt:** "The graph is freezing the browser when a query returns more than 500 nodes. Refactor `App.jsx` to use HTML5 Canvas instead of DOM nodes for the graph."
* **The Fix:** We replaced the rendering engine with `react-force-graph-2d`, which handles thousands of dynamic nodes instantly. I then prompted the AI to add a "Highlighting" feature that enlarges a node when the LLM mentions its specific ID in the chat.

### Iteration 4: Refining LLM Output Formatting & UI Parsing
* **The Bug:** The text formatter was returning triple asterisks (`***`) for bold text, which broke my custom React UI markdown parser. We also wanted the chatbot to proactively suggest follow-up questions to the user.
* **The Prompt:** "Update the formatting prompt. The LLM cannot use triple asterisks. Also, it must generate exactly three suggested follow-up questions based on the data, and wrap those questions inside `<SUGGESTED>` tags so the frontend can easily extract them into clickable buttons."
* **The Fix:** We heavily refined the system prompt for the `llama-3.1-8b` formatter, providing one-shot examples of how it should structure its markdown safely and use the exact `<SUGGESTED>` XML tags.

### Iteration 5: SAP Terminology & Entity Mapping 
* **The Bug:** When a user asked about a specific "Billing Document," the Text-to-SQL agent would often fail to `JOIN` it to the "Delivery" table because of opaque SAP identifier names in the dataset schema.
* **The Prompt:** "The generated SQL is returning 0 rows because the LLM doesn't understand that `VGBEL` (reference document) maps to the `Delivery_ID`. How can we fix this in the prompt?"
* **The Fix:** I worked with the AI to append an "Edge Case & Terminology" section directly into the system prompt. It explicitly taught the LLM the exact foreign key relationships (e.g., *Flow Trace: Sales Order -> Delivery -> Billing -> Journal Entry*) and mandated `LEFT JOIN`s for broken flows.

## 3. AI Prompting Strategy & Guardrails

A massive focus of this session was preventing prompt injection and hallucinatory answers, as evaluated in the project specs.

**The Prompting Strategy:**
Because the SQLite schema is complex, we engineered a rigorous Text-to-SQL system prompt.
I instructed the AI assistant: *"Configure the Groq API call to inject the full SQLite schema as context. Instruct the LLM that its ONLY role is to output a raw, valid SQL query—absolutely no conversational filler allowed."*

**The "REJECT" Guardrail Implementation:**
To handle off-topic queries (e.g., "What is the weather?"), I designed a hardcoded short-circuit.
* **The Prompt:** "We need a guardrail. Update the system prompt so if the user asks any general knowledge question unrelated to SAP data, the LLM must output exactly the word 'REJECT'."
* **The Execution:** We implemented an interception layer in `llm_service.py`. Before safely executing the SQL in a `try-except` block, Python checks if the LLM output starts with `"REJECT"`. If it does, the database is totally bypassed, and the user receives a standardized refusal message. 

This AI-native workflow allowed me to skip trivial data-mapping and focus heavily on application resiliency, dynamic graph mathematics, and strict LLM guardrails.
