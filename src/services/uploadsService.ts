import { RawUploadRecordSchema, type RawUploadRecord } from "@/domain/raw-schemas";
import { postFile } from "./mockClient";

/**
 * F04 업로드 — 파일은 백엔드 data/uploads/ 에 저장된다.
 * 분석·색인은 인제스트 파이프라인을 돌릴 때 반영된다(응답의 note가 그 사실을 말한다).
 */
export async function uploadDocument(file: File): Promise<RawUploadRecord> {
  return postFile("/api/frontend/uploads", file, RawUploadRecordSchema);
}
