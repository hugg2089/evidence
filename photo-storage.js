// Browser-only image persistence for the static GitHub Pages build.
// Evidence records contain imageId only; Blob URLs are temporary display values.
const baseRenderBooks=renderBooks;
const baseRenderLibrary=renderLibrary;

async function hydrateBookDisplayImages(){
 const images=await imageMap(books,'coverImageId');
 books.forEach(book=>Object.defineProperty(book,'cover',{value:images.get(book.coverImageId)||'',writable:true,configurable:true,enumerable:false}));
}
renderBooks=async function(){await hydrateBookDisplayImages();return baseRenderBooks()};
renderLibrary=async function(){await hydrateBookDisplayImages();return baseRenderLibrary()};

renderRecent=async function(){
 const recent=$('#recentList'),data=items.slice().sort((a,b)=>b.id-a.id).slice(0,4),images=await imageMap(items);
 if(!data.length){recent.innerHTML='<div class="empty-recent"><i>✦</i><b>No evidence yet</b><span>Your latest wins will appear here</span></div>';return}
 recent.innerHTML=data.map(x=>{const photo=images.get(x.imageId);return`<div class="recent-item"><i class="recent-icon${photo?' recent-photo':''}" ${photo?`style="background-image:url('${photo}')"`:''}>${photo?'':x.category==='english'?'EN':x.category==='photography'?'◉':x.category==='book'?'▤':'✦'}</i><span><b>${esc(x.title)}</b><small>${categoryMeta[x.category]?.name.toUpperCase()||'EVIDENCE'}</small></span><button data-open="${x.id}">${svg('arrow')}</button></div>`}).join('');
};

renderTimeline=async function(query=''){
 const root=$('#sectionContent'),q=query.toLowerCase();
 const data=items.filter(x=>(x.title+' '+(x.note||'')+' '+(categoryMeta[x.category]?.name||'')).toLowerCase().includes(q)).sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
 const images=await imageMap(data);
 if(currentPage!=='timeline')return;
 const search=`<label class="timeline-search glass">${svg('search')}<input id="timelineSearch" value="${esc(query)}" placeholder="Search your evidence"></label>`;
 root.innerHTML=search+(data.length?`<div class="timeline-list">${data.map(x=>{const photo=images.get(x.imageId);return`<article class="timeline-entry glass"><i class="${categoryMeta[x.category]?.color||'purple'}"></i>${photo?`<span class="timeline-photo" style="background-image:url('${photo}')"></span>`:''}<div><small>${formatDate(x.date)}</small><h3>${esc(x.title)}</h3><p>${categoryMeta[x.category]?.name.toUpperCase()||'EVIDENCE'}</p></div><div class="entry-actions">${x.category!=='book'?`<button data-edit="${x.id}">${svg('edit')}</button>`:''}<button data-delete="${x.id}">${svg('trash')}</button></div></article>`}).join('')}</div>`:emptyMarkup(q?'⌕':'◷',q?'Nothing found':'Your timeline is empty',q?'Try a different phrase.':'Every small win will build a visible trail here.'));
 const input=$('#timelineSearch');
 input.oninput=()=>{const pos=input.selectionStart,value=input.value;renderTimeline(value).then(()=>{const next=$('#timelineSearch');next?.focus();next?.setSelectionRange(pos,pos)})};
};

openEvidence=async function(dateValue,item=null){
 const form=$('#evidenceForm');
 clearPendingPhoto();showPhotoError();hidePhoto();form.reset();
 form.elements.date.value=dateValue||new Date().toISOString().slice(0,10);
 form.elements.id.value=item?.id||'';
 form.elements.category.value=item?.category||'english';
 form.elements.title.value=item?.title||'';
 form.elements.note.value=item?.note||'';
 editingImageId=item?.imageId||null;removeExistingPhoto=false;
 $('#evidenceModalTitle').textContent=item?'Edit Evidence':'Add Evidence';
 openModal($('#evidenceModal'));
 if(editingImageId){
  try{const url=await getImageUrl(editingImageId);if(url)showPhoto(url)}
  catch(error){showPhotoError('The saved photo could not be loaded. You can keep, replace or remove it.');storageError(error,'Could not load the saved photo')}
 }
};

const baseCloseModal=closeModal;
closeModal=function(modal){
 if(modal.id==='evidenceModal'){clearPendingPhoto();showPhotoError();hidePhoto();editingImageId=null;removeExistingPhoto=false}
 baseCloseModal(modal);
};

$('#evidenceForm').elements.photo.addEventListener('change',async event=>{
 showPhotoError();
 const file=event.target.files?.[0];
 if(!file)return;
 try{
  const blob=await validateImage(file);
  clearPendingPhoto();pendingPhotoBlob=blob;pendingPreviewUrl=URL.createObjectURL(blob);
  removeExistingPhoto=false;showPhoto(pendingPreviewUrl);
 }catch(error){
  event.target.value='';
  showPhotoError(error.message);
  showToast(error.message);
 }
});
$('#removePhoto').onclick=()=>{
 clearPendingPhoto();$('#evidenceForm').elements.photo.value='';
 removeExistingPhoto=true;hidePhoto();showPhotoError();
};

$('#evidenceForm').onsubmit=async event=>{
 event.preventDefault();showPhotoError();
 const form=event.currentTarget,data=new FormData(form),id=Number(data.get('id'))||Date.now();
 const existing=items.find(x=>x.id===id),oldImageId=existing?.imageId||null;
 let imageId=removeExistingPhoto?null:oldImageId,createdImageId=null;
 try{
  if(pendingPhotoBlob){createdImageId=makeImageId('evidence',id);await putImage(createdImageId,pendingPhotoBlob);imageId=createdImageId}
  const record={id,date:data.get('date'),category:data.get('category'),title:data.get('title').trim(),note:data.get('note').trim(),imageId};
  if(existing)items=items.map(x=>x.id===id?record:x);else items.push(record);
  save();
  if(oldImageId&&oldImageId!==imageId)await deleteImageIfUnused(oldImageId);
  closeModal($('#evidenceModal'));renderAll();
  if(currentPage!=='calendar')renderSection(currentPage);
  showToast(existing?'EVIDENCE UPDATED':'EVIDENCE SAVED');
 }catch(error){
  if(createdImageId){try{await deleteImage(createdImageId)}catch{}}
  console.error(error);
  showPhotoError('The photo could not be saved in this browser. Check storage permissions and try again.');
  showToast('PHOTO SAVE FAILED');
 }
};

$('#bookForm').onsubmit=async event=>{
 event.preventDefault();
 const form=event.currentTarget,data=new FormData(form),id=Date.now(),file=data.get('cover');
 let coverImageId=null;
 try{
  const blob=await validateImage(file);
  if(blob){coverImageId=makeImageId('book',id);await putImage(coverImageId,blob)}
  const evidenceId=id+1,book={id,evidenceId,title:data.get('title').trim(),author:data.get('author').trim(),date:data.get('date'),rating:Number(data.get('rating')),note:data.get('note').trim(),coverImageId};
  books.push(book);
  items.push({id:evidenceId,date:book.date,category:'book',title:`Finished: ${book.title}`,note:book.note,imageId:coverImageId});
  selectedBook=id;save();form.reset();closeModal($('#bookModal'));renderAll();showToast('BOOK ADDED TO LIBRARY');
 }catch(error){
  if(coverImageId){try{await deleteImage(coverImageId)}catch{}}
  console.error(error);showToast(error.message||'The cover could not be saved.');
 }
};

document.addEventListener('click',event=>{
 const button=event.target.closest('[data-delete]');
 if(!button)return;
 const record=items.find(x=>x.id===Number(button.dataset.delete)),imageId=record?.imageId;
 setTimeout(()=>deleteImageIfUnused(imageId).catch(error=>storageError(error,'The entry was deleted, but its image could not be cleaned up')),0);
},true);

window.addEventListener('beforeunload',()=>{
 objectUrls.forEach(url=>URL.revokeObjectURL(url));
 if(pendingPreviewUrl)URL.revokeObjectURL(pendingPreviewUrl);
});

migrateLegacyImages().then(renderAll).catch(error=>storageError(error));
