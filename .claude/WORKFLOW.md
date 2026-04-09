Claude Code Workflow

1. Gather context (background task)
prompt: "& You are software engineer. Im working on feature/problem ... and the related codes are [mention files] make a summary and mindmapping about the codebase and feature"

2. Plan and Discuss (plan mode)
prompt: 
"Overview:
[tell summary about feature/issue in concise]

Jira:
[Paste jira taks description, including image]

Test case:
[Paste test case or done criteria]

Your Tasks:
- Analyze and give me your first assumtion about this issue/feature
- find root cause and your hypothesis solution
- write planning into docs file
- give me list of questions if any unclear information
"

3. Implementation
accept clear context and auto edit

4. Testing
Run loop test & fixes prompt


