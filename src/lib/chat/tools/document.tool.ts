import z from "zod";
import {
  generateId,
  streamText,
  tool,
  type InferToolInput,
  type InferToolOutput,
  type LanguageModel,
  type ModelMessage,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import type { xDataPart } from "$lib/types/chat-types";
import { result } from "$lib/server/service/result.service";

export const createdDocumentTool = (
  writer?: UIMessageStreamWriter<UIMessage<never, xDataPart>>,
  model?: LanguageModel
) => {
  if (!writer || !model) {
    throw new Error("Writer and model are required");
  }
  return tool({
    name: "createDocument",
    description: [
      "Create or draft a well-structured long-form document in Markdown, returning a concise title and the full content.",
      "Use this tool whenever the user asks to write, draft, create, generate, outline, expand, or turn content into a document or artifact (e.g. report cards, notes, briefs, PRDs, specs, proposals, plans, emails, blog posts, articles, summaries).",
      "The UI streams the result into a document card.",
    ].join(" "),
    inputSchema: z.object({ title: z.string() }),
    outputSchema: z.string(),
    execute: async (input, { messages }) => {
      const documentId = generateId();
      const { textStream } = streamText({
        model,
        system: [
          "You generate a polished, useful document from the conversation context.",
          "Output strictly content (Markdown).",
          "Content requirements:",
          "- Use clean Markdown with headings, short paragraphs, and bullet lists where helpful.",
          "- Include code blocks or tables if they add clarity.",
          "- Avoid YAML front matter and avoid repeating the title as an H1 unless explicitly requested.",
          "- Keep tone clear and professional; match any user-provided tone if specified.",
          "- If requirements are ambiguous, choose sensible defaults and proceed.",
        ].join("\n"),
        messages: await addResultDataToMessage(messages),
      });

      writer.write({
        type: "data-createDocument",
        id: documentId,
        data: {
          status: "processing",
          content: undefined,
          title: input.title,
        },
      });

      let fullContent = "";

      for await (const chunk of textStream) {
        fullContent += chunk;

        writer.write({
          type: "data-createDocument",
          id: documentId,
          data: {
            status: "streaming",
            content: fullContent,
            title: input.title,
          },
        });
      }

      writer.write({
        type: "data-createDocument",
        id: documentId,
        data: {
          status: "success",
          content: fullContent,
          title: input.title,
        },
      });

      return `<created_document id="${documentId}">
          ${fullContent}
          </created_document>`;
    },
  });
};

const addResultDataToMessage = async (messages: ModelMessage[]): Promise<ModelMessage[]> => {
  const resultData = await result.getStudentResult(32, 5);
  if (!resultData) return messages;
  resultData.student.studentPhoto = "";
  resultData.school.logo = "";

  const lastMessage = messages.pop();
  if (!lastMessage) return messages;
  const data = `RESULT DATA: \n${JSON.stringify(resultData)}\n`;
  const prompt = `Generate the report card for ${resultData.student.fullName} based on the result data provided and use the ${resultData.examType.title} as the title.`;
  return [...messages, { role: "user", content: `${lastMessage.content}\n${data}\n${prompt}` }];
};

export type createDocumentInput = InferToolInput<ReturnType<typeof createdDocumentTool>>;
export type createDocumentOutput = InferToolOutput<ReturnType<typeof createdDocumentTool>>;
