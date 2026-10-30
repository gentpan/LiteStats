export async function rpc<T>(path:string,method="GET",body?:unknown):Promise<T>{
  const form=body instanceof FormData
  const response=await fetch(path,{method,credentials:"same-origin",headers:{"X-Plost-Request":"1",...(!form&&body?{"Content-Type":"application/json"}:{})},body:body?form?body:JSON.stringify(body):undefined})
  if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(typeof result.error==="string"?result.error:result.error?.message||"暂时无法完成操作，请重试")}
  return response.json()
}
export async function download(path:string,body:unknown){
  const response=await fetch(path,{method:"POST",credentials:"same-origin",headers:{"X-Plost-Request":"1","Content-Type":"application/json"},body:JSON.stringify(body)})
  if(!response.ok){const data=await response.json();throw Error(data.error||"备份失败")}
  const url=URL.createObjectURL(await response.blob());const link=document.createElement("a");link.href=url;link.download=response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1]||"plost.plostbk";link.click();setTimeout(()=>URL.revokeObjectURL(url),30000)
}
