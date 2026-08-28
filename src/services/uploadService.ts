import type { RequestContext, UploadAnalysisVM, UploadCandidate } from "@/api/ui-api-boundary-v2";
import { getFrontendApiService } from "./apiClient";
import { createIdempotencyKey, requestScope, runApiRequest } from "./requestExecution";

export async function prepareUpload(context: RequestContext, files: readonly File[], signal?: AbortSignal): Promise<UploadAnalysisVM> {
  const candidates: UploadCandidate[] = files.map((file) => ({
    clientId: crypto.randomUUID(), name: file.name, sizeBytes: file.size, mimeType: file.type, lastModified: file.lastModified,
  }));
  return runApiRequest(requestScope(["upload-prepare", context.sessionEpoch, context.assignmentId]), signal, async (requestSignal) => {
    const api = await getFrontendApiService();
    const prepared = await api.prepareUpload(context, {
      files: candidates,
      idempotencyKey: createIdempotencyKey("upload-prepare"),
      signal: requestSignal,
    });
    if (!prepared.jobId || prepared.status === "disabled") return prepared;
    let latest = prepared;
    for (let index = 0; index < files.length; index += 1) {
      latest = await api.transferUploadFile(context, {
        uploadId: prepared.jobId,
        clientFileId: candidates[index].clientId,
        body: files[index],
        idempotencyKey: createIdempotencyKey("upload-transfer"),
        signal: requestSignal,
      });
    }
    return latest;
  });
}
