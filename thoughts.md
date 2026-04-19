When a user sends a chat

What is passed into the chat request?
- The message
- The session id (if not a new conversation)
- The agent used to start the process
- The model to use
- Chat history
- Some metadata like any user settings 
  - Name
  - Location
  - Preferred response shape
  - Time

Once the backend receives a chat request
- It creates a session OR re-uses an existing session based on session id passed in.
- It retrieves the agent to use which will contain the system prompt template and the tools to use
- It creates the run context and begins to stream

During generation
- The run context is updated 
- SSE are sent