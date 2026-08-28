import { useState } from "react";
import { Link } from "react-router-dom";
import { FileIcon } from "@/lib/icons";
import { KIND_LABEL, type CommunityPost } from "./communityData";
import { connectCommunityPost, useCommunityLinks } from "./communityLinks";

export function CommunityPostCard({ post, compact = false, taskContext = false }: { post: CommunityPost; compact?: boolean; taskContext?: boolean }) {
  const [helpful, setHelpful] = useState(false);
  const [showLinkPrompt, setShowLinkPrompt] = useState(false);
  const linkedIds = useCommunityLinks();
  const isLinked = linkedIds.includes(post.id);

  const handleHelpful = () => {
    const next = !helpful;
    setHelpful(next);
    if (next && !isLinked) setShowLinkPrompt(true);
  };

  const handleConnect = () => {
    connectCommunityPost(post.id);
    setShowLinkPrompt(false);
  };

  return (
    <article className={`community-post${compact ? " compact" : ""}`}>
      <div className="community-post-head">
        <span className={`community-kind ${post.kind}`}>{KIND_LABEL[post.kind]}</span>
        {taskContext && <span className="shared-origin">🍊 감 나누기</span>}
        {!taskContext && isLinked && <span className="linked-state">✓ 내 업무</span>}
        <span className="community-time">{post.createdAt}</span>
      </div>

      <Link className="community-task" to={`/tasks/${post.taskId}`}>
        <span>{post.taskCategory}</span><b>›</b><strong>{post.taskTitle}</strong>
      </Link>

      <p className="community-body">{post.body}</p>

      {!compact && post.attachments?.map((file) => (
        <button className="community-file" key={file.name}>
          <span className="fic"><FileIcon /></span>
          <span><b>{file.name}</b><small>{file.meta}</small></span>
          <em>미리보기</em>
        </button>
      ))}

      {!compact && post.answers?.map((answer) => (
        <div className="community-answer" key={answer.author}>
          <b>답변 · {answer.author}</b>
          <p>{answer.body}</p>
        </div>
      ))}

      <div className="community-meta">
        <span>업무 태그 · {post.taskCategory}</span>
        <span>{post.schoolLevel}</span>
        <span>{post.academicYear}년</span>
        <span>{post.materialType}</span>
        <span className={`evidence ${post.evidence}`}>{post.evidence}</span>
      </div>

      <div className="community-foot">
        <span className="community-author">{post.author}</span>
        <button
          className="helpful-btn"
          aria-pressed={helpful}
          onClick={handleHelpful}
        >
          🍊 감 잡았어요 <b>{post.helpfulCount + (helpful ? 1 : 0)}</b>
        </button>
        {post.kind === "question" && <button className="btn btn-ghost btn-sm">답변하기</button>}
      </div>
      {showLinkPrompt && (
        <div className="link-prompt">
          <span>내 업무로 연결할까요?</span>
          <button onClick={() => setShowLinkPrompt(false)}>나중에</button>
          <button className="connect" onClick={handleConnect}>연결</button>
        </div>
      )}
    </article>
  );
}
