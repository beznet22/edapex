We need to overhaul workflows in the codebase, bellow are the things we should do:

1. We decide how chat workflows should handle extract, publish, validate and generate workflow as steps or as tools (accounting for assistant agent turns)

2. editor-command workflow will now be invoked from /api/chat (src/routes/api/chat/+server.ts) targeted by its workflowId

3. extract, publish, validate and generate workflow are no longer workflow but what ever is decided in item 1

4. The normal and frequent user usage flow is as follows:

- Teachers/Admin/IT/coordinators uploads a marksheet screenshot from the chat composer
- we do immediate OCR extraction with structure output using mistral SDK 
- we store the output JSON the users workspace scoped by schoolId, academicYear, classId and sectionId, returns document metadata as js object
- the use ask the agent to generate report (or similar intent or the user uses a built-in skill command for this), presses enter
- On the client before sendMessage is called the all the list of returned metadata is injected into the message (we need to decide to inject as metadata or as data part, or as text part)
- The assistant agent runs in the workflow, if uploaded marksheets (metadata) are  more than one it gives the user a summary of all uploaded worksheet and ask the user which one to work on else if marksheets is just one then just call the next step 
- the next step is the document artifact step which will retrieve the JSON from the workspace based on the metadata, gives it to the document agent
- the document agent converts the JSON into a clean well structured academic document and streams the document back to the UI as data parts
- before the document start streaming we send a data part the UI recieves the start command and auto open the editor side panel and shows the Shimmer artifact card inline, the users sees the document part streaming in token by token
- after streaming is complete the workflow should pause and wait for user audit and verification
- The editor should show a validate button, when the user finishes auiding, he clicks the validate button then the workflow is resumed
- when the workflow is resumed it runs the validate step (this step validate the resultData against the zod schema) 
- if validation fails, the validation error is passed to the next step for the assistant agen to canvert to a user frienly messages with suggested fixes and present it to the user, the workflow is paused again
- after assistant agent provides the user with suggested fixes, the user can then correct the error and click the validate button again
- the validation step can be run multiple times until the validation passes
- once validation passes, the workflow goes to the final step for commiting result data to the DB, 
- after commiting the result data to the DB thethe assistant agent summarises the action and the next step is to either generate or publish result pdf artifact.

5. The current generate workflow (no longer a workflow) should be simplified to just generate result PDF, should require schoolId, academicId, examTypeId, classId, sectionId, studenId/admissionNo/student fullName or part name (Some requirements are auto resolve from conversation context and AI should ask and gather info from the user before execution). It will gets the resultData from db, parse it using the resultTemplat then generate the pdf as a document artifact

6. The current publish workflow (no longer a workflow) should be simplified to just publish the result PDF if already generated and available in the users workspace (see mastra workspace and /filestore page and endpoints) if not available then generate a new one and publish

7. The current validate workflow (no longer a workflow) should be simplified to be a step in the chat workflow to just validate the resultData against the zod schema: It  runs as a rusumed step after the result data is streamed to the user for audit, when the user clicks valiadat button (which is revealed after streaming).

8. We do not need the extract workflow anymore, we should just use mistral for instant extraction when the user uploads a marksheet and send it back to the user immediately.

9. Other slash commands are just tools used by the assistant agent to accomplish tasks.

10. Also we need strategies how Parent can also use the platform via telegram bot, they should be able to chat with the Assistant agent to view their child result as pdf or ask questions their child performance or marks in general. (analyse the DB schema and find parent specific operations that can be done via telegram bot)

11. We need decide how parent should authenticate to use the platform via telegram bot. Give me options. (one option is to use magic link)

12. Also note the the chat workflow is our master workflow. All other workflows are just steps in the chat workflow. wvery UI Chat client calls this master chat workflow. via the /api/chat endpoint


RELEVANT FILES:
src/lib/server/mastra/workflows/chat.ts
src/routes/api/chat/+server.ts