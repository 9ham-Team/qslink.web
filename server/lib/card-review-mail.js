'use strict';

function approvedMailAfterCommit(ctx, card, previousStatus) {
  if (card.status !== 'approved' || previousStatus === 'approved' ||
      !ctx.config.publicOrigin || !ctx.config.sendCardReviewMail) return undefined;
  const owner = ctx.db.find('users', user => user.id === card.ownerId);
  if (!owner || !owner.email || owner.status === 'banned') return undefined;
  const email = owner.email;
  const notification = {
    cardId: card.id,
    cardTitle: card.title,
    url: ctx.config.publicOrigin + '/card/' + encodeURIComponent(card.id),
  };
  return async () => {
    try { await ctx.config.sendCardReviewMail(email, notification); }
    catch {
      // Do not undo approval or expose recipient data / provider errors.
      console.warn('[mail] 卡片审核通过提醒发送失败');
    }
  };
}

module.exports = { approvedMailAfterCommit };
