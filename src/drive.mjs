export function parseDriveLink(value) {
  const url=new URL(value.trim());
  if(url.protocol!=='https:'||!['drive.google.com','docs.google.com'].includes(url.hostname))throw Error('Paste a Google Drive file link.');
  const id=url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1]||url.searchParams.get('id');
  if(!id||!/^[-\w]{10,200}$/.test(id))throw Error('This link does not identify a Drive file.');
  const resourceKey=url.searchParams.get('resourcekey');
  if(resourceKey&&!/^[-\w]{1,200}$/.test(resourceKey))throw Error('Invalid Drive resource key.');
  return {id,...(resourceKey?{resourceKey}:{})};
}
export function driveHeaders(selection,token) {
  return {Authorization:`Bearer ${token}`,...(selection.resourceKey?{'X-Goog-Drive-Resource-Keys':`${selection.id}/${selection.resourceKey}`}:{})};
}
export async function metadata(selection,token,fetcher=fetch) {
  const url=new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(selection.id)}`);
  url.searchParams.set('fields','id,name,size,version,modifiedTime,capabilities(canDownload)');url.searchParams.set('supportsAllDrives','true');
  const response=await fetcher(url,{headers:driveHeaders(selection,token),cache:'no-store'});
  if(!response.ok)throw Error(response.status===404?'File unavailable. Select this file with Google Picker to grant access, and check the signed-in account.':response.status===401?'Google sign-in expired. Reconnect to continue.':'Drive metadata request failed. Check file access.');
  const data=await response.json();
  if(!data.capabilities?.canDownload||!Number.isSafeInteger(Number(data.size))||Number(data.size)<4096)throw Error('This file cannot be downloaded or is not an MDB file.');
  return data;
}
export function rangeFetcher(selection,token,info,fetcher=fetch,signal) {
  return async(start,end)=>{
    const response=await fetcher(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(selection.id)}?alt=media&supportsAllDrives=true`,{
      headers:{...driveHeaders(selection,token),Range:`bytes=${start}-${end-1}`},cache:'no-store',signal});
    // Abort before buffering if Drive ignores the range. Never accept a full-file response.
    if(response.status!==206){await response.body?.cancel();throw Error(response.status===401?'Google sign-in expired. Reconnect.':'Drive did not return a partial download; stopped to protect memory.');}
    const expected=end-start;const declared=response.headers.get('Content-Length');
    if(declared&&Number(declared)!==expected){await response.body?.cancel();throw Error('Incorrect range size.');}
    const contentRange=response.headers.get('Content-Range');
    if(contentRange&&contentRange!==`bytes ${start}-${end-1}/${info.size}`){await response.body?.cancel();throw Error('Incorrect range response.');}
    const reader=response.body.getReader();const output=new Uint8Array(expected);let offset=0;
    try {while(true){const {done,value}=await reader.read();if(done)break;if(offset+value.length>expected)throw Error('Range response exceeded budget.');output.set(value,offset);offset+=value.length;}}
    catch(e){await reader.cancel();throw e;}finally{reader.releaseLock();}
    if(offset!==expected)throw Error('Truncated download.');
    return output;
  };
}
