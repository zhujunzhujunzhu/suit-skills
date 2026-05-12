import { useEffect, useState } from 'react';
import { approveSkillPackageUpload, listFeedback, listSkillPackageUploads, type FeedbackItem, type PackageUploadRecord } from '../api/client';
import { PageHeader, ReviewItem } from './shared';

export function ReviewCenter() {
  const [reviews, setReviews] = useState<FeedbackItem[]>([]);
  const [uploads, setUploads] = useState<PackageUploadRecord[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const [nextReviews, nextUploads] = await Promise.all([listFeedback({ status: 'all' }), listSkillPackageUploads({ status: 'waiting_review' })]);
    setReviews(nextReviews);
    setUploads(nextUploads);
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  async function approveUpload(id: string) {
    await approveSkillPackageUpload(id);
    await refresh();
  }

  function updateReviewInList(review: FeedbackItem) {
    setReviews((current) =>
      current.map((item) => (item.id === review.id ? review : item)),
    );
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Review center" title="评价中心" description="处理用户评价、技能包审核与发布流转。" />
      <section className="review-list"><div className="panel-head"><h2>待审核上传</h2><span>{uploads.length} 个</span></div>{loading ? <div className="empty-state">加载中...</div> : null}{!loading && !uploads.length ? <div className="empty-state">暂无待审核上传。</div> : null}{uploads.map((upload) => <article className="review-item" key={upload.id}><div className="panel-head"><strong>{upload.metadata.name} / {upload.metadata.version}</strong><button className="primary" type="button" onClick={() => void approveUpload(upload.id)}>通过审核</button></div><p>{upload.metadata.description}</p><div className="tag-row">{upload.metadata.tags.map((tag) => <em key={tag}>{tag}</em>)}</div>{upload.validation.map((item) => <small key={item.code}>{item.severity}: {item.message}</small>)}</article>)}</section>
      <section className="review-list"><div className="panel-head"><h2>评价</h2><span>{reviews.length} 条</span></div>{!loading && !reviews.length ? <div className="empty-state">暂无评价。</div> : null}{reviews.map((review) => <ReviewItem key={review.id} review={review} onStatusChange={updateReviewInList} />)}</section>
    </div>
  );
}
