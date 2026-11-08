/* From 모아읽기 (MoaReader 1.2.4): list / post / comment parsers for the four boards.
   Changed for Digital Detox: the list no longer needs a separate approved-id list. */
'use strict';
/* Pure extractors. Every displayed post must also be approved by the native broker.
   Source HTML is parsed inertly and never attached to the live document. */
window.Feeds=(()=>{
 const names=['해외축구','롤','특갤','나무 실검'];
 const kinds=['인기글','인기글','개념글','채널 글'];
 const origins=['https://www.fmkorea.com','https://www.fmkorea.com','https://gall.dcinside.com','https://arca.live'];
 const text=(el,sel)=>((sel?el.querySelector(sel):el)?.textContent||'').replace(/\s+/g,' ').trim();
 const parse=html=>new DOMParser().parseFromString(String(html),'text/html');
 function postId(href,b){try{
  if(!Number.isInteger(b)||b<0||b>3||/[\\\s%]/.test(href))return null;
  const u=new URL(href,origins[b]);if(!['https:','http:'].includes(u.protocol)||u.port||u.username||u.password)return null;
  if(b===3){if(u.protocol!=='https:'||u.hostname!=='arca.live')return null;return u.pathname.match(/^\/b\/namuhotnow\/([1-9][0-9]{0,11})$/)?.[1]||null;}
  if(b===2){if(u.hostname!=='gall.dcinside.com'||u.pathname!=='/mgallery/board/view/'||u.searchParams.getAll('id').length!==1||u.searchParams.get('id')!=='thesingularity'||u.searchParams.getAll('no').length!==1)return null;const n=u.searchParams.get('no');return /^[1-9][0-9]{0,11}$/.test(n||'')?n:null;}
  if(!['www.fmkorea.com','fmkorea.com','m.fmkorea.com'].includes(u.hostname))return null;
  const mids=u.searchParams.getAll('mid');if(mids.length>1||mids.length&&mids[0]!==['football_world','lol'][b])return null;
  let path=u.pathname;if(path.startsWith('/football_world/')){if(b!==0)return null;path=path.slice(15);}else if(path.startsWith('/lol/')){if(b!==1)return null;path=path.slice(4);}
  if(/^\/[1-9][0-9]{0,11}$/.test(path))return path.slice(1);
  if(!['/','/index.php','/search.php'].includes(path)||u.searchParams.getAll('document_srl').length!==1)return null;
  const id=u.searchParams.get('document_srl');return /^[1-9][0-9]{0,11}$/.test(id||'')?id:null;
 }catch(_){return null;}}
 function cleanTitle(a){const n=a.cloneNode(true);n.querySelectorAll('script,style,img,.replyNum,.reply_num,.reply_numbox,.comment-count,.badge,.icon,.title-badge').forEach(x=>x.remove());return text(n);}
 function parseList(data,b){
  const doc=parse(data.html),allowed=data.ids?new Set(data.ids.map(String)):null,found=new Set(),out=[];
  function add(no,row,title,meta){if(!no||(allowed&&!allowed.has(no))||found.has(no)||!title)return;found.add(no);out.push({no,board:b,title,category:names[b],writer:'작성자',date:'',views:'',recommends:'',comments:'',...meta});}
  if(b===2){const root=doc.querySelector('table.gall_list');if(!root)return out;
   for(const row of root.querySelectorAll('tr')){if(row.matches('.notice,.gall_notice,.notice_list')||/공지|설문|광고|AD/.test(text(row,'.gall_num'))||text(row,'.gall_subject').includes('공지'))continue;
    const a=[...row.querySelectorAll('.gall_tit a')].find(x=>postId(x.getAttribute('href')||'',b));const no=a&&postId(a.getAttribute('href')||'',b);
    if(row.dataset.no&&row.dataset.no!==no)continue;
    if(a)add(no,row,cleanTitle(a),{category:text(row,'.gall_subject')||'개념글',writer:text(row,'.gall_writer .nickname,.gall_writer')||'익명',date:row.querySelector('.gall_date')?.getAttribute('title')||text(row,'.gall_date'),views:text(row,'.gall_count'),recommends:text(row,'.gall_recommend'),comments:text(row,'.reply_numbox,.reply_num')});
   }return out;
  }
  if(b===3){const root=doc.querySelector('.article-list');if(!root)return out;
   for(const row of root.querySelectorAll('a.vrow')){if(row.matches('.notice-service,.ad')||row.querySelector('.col-ad,#textad'))continue;
    const no=postId(row.getAttribute('href')||'',b),title=row.querySelector('.col-title,.title');if(!title)continue;
    add(no,row,cleanTitle(title),{category:row.classList.contains('notice')?'공지':text(row,'.category,.badge')||'실검',writer:text(row,'.col-author,.user-info')||'작성자',date:row.querySelector('time')?.getAttribute('datetime')||text(row,'.col-time,time'),views:text(row,'.col-view'),recommends:text(row,'.col-rate'),comments:text(row,'.comment-count,.col-comment')});
   }return out;
  }
  const root=doc.querySelector('#bd')||doc.querySelector('.bd');if(!root)return out;
  const excluded='aside,nav,header,footer,.sidebar,.side,.side_area,.fdb_lst,.rd,.rd_body,.xe_content,.bd_hd,.bd_tl,.pagination,.notice,.notice_list,.ad,.ad_item';
  function visit(node,active=false,depth=0){if(depth>64)return;for(const child of node.children){
   if(child.matches(excluded)||child.matches('script,style,textarea,title'))continue;
   if(child.dataset.mid&&child.dataset.mid!==['football_world','lol'][b])continue;
   const here=active||child.matches('.bd_lst,.fm_best_widget,.list_tbody,.board_list,.list_wrap');
   if(here&&child.matches('li,tr,.list_row,.li')){if(/공지|광고/.test(text(child,'.no')))continue;
    const title=child.matches('.title,.list_title,.subject')?child:child.querySelector('.title,.list_title,.subject');if(title){
     const a=title.matches('a')?title:[...title.querySelectorAll('a')].find(x=>postId(x.getAttribute('href')||'',b));const no=a&&postId(a.getAttribute('href')||'',b);
     if(a)add(no,child,cleanTitle(a),{category:text(child,'.category,.cate')||names[b],writer:text(child,'.author,.nickname,.member_plate')||'작성자',date:child.querySelector('.time,.date,.regdate')?.getAttribute('title')||text(child,'.time,.date,.regdate'),views:text(child,'.readNum,.read_count,.read,.m_no'),recommends:text(child,'.vote_count,.voteNum,.voted_count,.vote,.m_no_voted,.pc_voted_count .count'),comments:text(child,'.replyNum,.reply_num')});continue;
    }
   }visit(child,here,depth+1);
  }}visit(root,root.matches('.bd_lst,.fm_best_widget,.list_tbody,.board_list,.list_wrap'));return out;
 }
 function article(doc,b,row){
  const body=doc.querySelector(b===2?'.write_div':b===3?'.article-content':'.rd_body .xe_content,.xe_content');
  const title=text(doc,b===2?'.title_subject':b===3?'.article-head .title,.article-head .article-title,.article-title':'.rd_hd .np_18px,.rd_hd .title,.rd_hd h1')||row.title;
  const writer=text(doc,b===2?'.gallview_head .nickname':b===3?'.article-head .user-info,.article-head .author':'.rd_hd .member_plate,.rd_hd .author')||row.writer;
  const date=text(doc,b===2?'.gallview_head .gall_date':b===3?'.article-head time':'.rd_hd .date,.rd_hd .time')||row.date;
  return {body,title,writer,date};
 }
 function commentMax(doc,b,page){
  let max=page;
  for(const a of doc.querySelectorAll('a,button,em,strong,span')){
   if(a.closest('.article-content,.write_div,.rd_body,.comment-item,.usertxt,.xe_content,.comment-content,.comment_content,.comment-body,.message'))continue;
   if(b===2){const m=(a.getAttribute('onclick')||'').match(/(?:comment_page|commentPage)\s*\(\s*['"]?([1-9][0-9]{0,3})/);if(m)max=Math.max(max,Number(m[1]));}
   if(!a.getAttribute('href'))continue;
   try{const u=new URL(a.getAttribute('href'),origins[b]);if(u.origin!==origins[b]&&!(b<2&&['fmkorea.com','m.fmkorea.com'].includes(u.hostname)))continue;const n=u.searchParams.get(b===3?'cp':b===2?'comment_page':'cpage');if(/^[1-9][0-9]{0,3}$/.test(n||''))max=Math.max(max,Number(n));}catch(_){}
  }
  if(b===2)for(const n of doc.querySelectorAll('.pagination a,.pagination em,.paging a,.paging em,.cmt_paging a,.cmt_paging em')){const v=text(n);if(/^[1-9][0-9]{0,3}$/.test(v))max=Math.max(max,Number(v));}
  return max;
 }
 function commentResult(d,b,page){
  if(b===2&&Array.isArray(d.comments))return {max:commentMax(parse(d.pagination||''),b,page),total:Number(d.total),items:d.comments.map(c=>({id:String(c.id),name:text(parse(c.name||'').body)||'익명',date:c.date||'',reply:Number(c.depth)>0,content:parse(c.html||c.memo||'').body,images:c.images||[]}))};
  if(typeof d.html!=='string')throw new Error('댓글 응답 형식이 올바르지 않아요.');const doc=parse(d.html);
  const selector=b===2?'.moa-mobile-comments,.comment-wrap,.comment_wrap,.comment_box,.comment-list,#comment_list,#reply_list,.reply_list,.cmt_list':b===3?'.comment-list,#comment,.comment-wrapper,.article-wrapper':'.fdb_lst,#cmt_list,#comment_list,#comment';
  const root=[...doc.querySelectorAll(selector)].find(n=>!n.closest('.write_div,.thum-txtin,.article-content,.rd_body'));
  if(!root)throw new Error('댓글 영역을 확인하지 못했어요.');
  const rowSelector=b===2?'li[id^="comment_"],li[id^="reply_"],.comment-item,.comment-row,li.comment,li[data-no],[data-comment-id],.reply_list > li,.cmt_list > li':b===3?'.comment-item,[data-comment-id],.comment':'[id^="comment_"],[data-comment-srl]';
  const nodes=[...root.querySelectorAll(rowSelector)];if(root.matches(rowSelector))nodes.unshift(root);
  const seen=new Set(),items=[];
  for(const c of nodes){
   if(c.closest('.article-content,.write_div,.thum-txtin,.rd_body'))continue;
   const id=String(c.getAttribute('data-comment-srl')||c.getAttribute('data-comment-id')||c.getAttribute('data-id')||c.getAttribute('data-no')||c.id.replace(/^comment_(?:li_)?|^reply_/,'')||(b>=2?'row'+items.length:''));
   if(seen.has(id)||b<2&&!/^[1-9][0-9]{0,11}$/.test(id))continue;
   const contentSelector=b===2?'.cmt_txtbox .usertxt,.usertxt,.comment-txt,.comment_txt,.comment-text,.comment_text,.comment-content,.comment_content,.comment-body,.txt,.memo':b===3?'.message .text,.text,.comment-content,.comment_content,.content,.message':'.xe_content,.comment-content,.comment_content,.comment-body';
   const content=[...c.querySelectorAll(contentSelector)].find(n=>n.closest(rowSelector)===c);
   if(!content)continue;seen.add(id);
   const classes=c.className+' '+(c.getAttribute('style')||'')+' '+(c.parentElement?.className||'');
   const parentRow=c.parentElement?.closest(rowSelector);
   const nested=!!parentRow&&parentRow!==root&&(b>=2||/^[1-9][0-9]{0,11}$/.test(parentRow.getAttribute('data-comment-srl')||parentRow.id.replace(/^comment_/,'')));
   const reply=/\bre\b|\breply\b|\breply-wrap\b|\bdepth[1-9]|\bre[1-9]|margin-left\s*:\s*[1-9]/.test(classes)||Number(c.getAttribute('data-depth'))>0||Number(c.getAttribute('data-parent'))>0||nested;
   const nameSelector=b===2?'.gall_writer .nickname,.nickname,.nick,.nick_name,.author,.name':b===3?'.user-info a,.user-info,.nickname,.author':'.member_plate,.author,.nickname,.meta a[class*="member_"],.meta .nick,.meta a';
   const name=[...c.querySelectorAll(nameSelector)].find(n=>n.closest(rowSelector)===c);
   const date=[...c.querySelectorAll('time,.date_time,.date,.time')].find(n=>n.closest(rowSelector)===c);
   items.push({id,name:text(name)||'익명',date:text(date),reply,content,images:d.images||[]});if(items.length>=500)break;
  }
  if(nodes.length&&!items.length)throw new Error('댓글 항목은 있지만 내용을 읽지 못했어요. 댓글 0개로 처리하지 않습니다.');
  return {items,total:Number.isFinite(Number(d.total))?Number(d.total):items.length,max:commentMax(doc,b,page)};
 }
 function articleComments(d,b){try{const result=commentResult(d,b,1);return result.items.length?result:null;}catch(_){return null;}}
 return Object.freeze({names,kinds,origins,postId,parseList,article,commentResult,articleComments});
})();
