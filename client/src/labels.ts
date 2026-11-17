export function createLabels(t:(source:string)=>string) {
  const card:Record<string,string>={pending:'审核中',approved:'已通过',rejected:'已拒绝'};
  const exchange:Record<string,string>={pending:'待处理',approved:'已同意',rejected:'已拒绝',completed:'已完成',cancelled:'已取消'};
  return {statusText:(status:string)=>card[status]?t(card[status]):status || t('未知'),exchangeText:(status:string)=>exchange[status]?t(exchange[status]):status || t('未知')};
}
