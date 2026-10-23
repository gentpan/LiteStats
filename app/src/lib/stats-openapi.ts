const count = {type:"integer", minimum:0}
const daily = {
  type:"object", required:["date","visitors","visits","pageviews"],
  properties:{date:{type:"string",format:"date"},visitors:count,visits:count,pageviews:count},
}
const errorSchema = {
  type:"object",required:["error"],properties:{
    error:{type:"object",required:["code","message"],properties:{code:{type:"string"},message:{type:"string"}}},
  },
}
const errors = Object.fromEntries([
  [400,"Invalid or repeated query parameter"],
  [401,"Missing, invalid or revoked credential"],
  [403,"Credential domain mismatch"],
  [429,"Rate limit exceeded; honor Retry-After"],
  [503,"Data service unavailable; do not interpret as zero traffic"],
].map(([code,description])=>[String(code),{
  description,
  headers:code===429?{"Retry-After":{description:"Seconds to wait before retrying",schema:{type:"integer",minimum:1}}}
    :code===401?{"WWW-Authenticate":{schema:{type:"string"}}}:{},
  content:{"application/json":{schema:errorSchema}},
}]))

export const statsOpenApi = {
  openapi:"3.1.0",
  info:{
    title:"LiteStats Read API",version:"1.0.0",
    description:"Read-only site aggregates. Bearer credentials are existing site sharing slugs; deleting the share revokes API access. A sharing credential also permits reading its shared report. Never put it in public client code.",
  },
  servers:[{url:"/"}],
  components:{securitySchemes:{sharingCredential:{
    type:"http",scheme:"bearer",
    description:"Create a named share under Site settings → Visibility; use the final /share/ path segment. Scope: that single site's aggregated report.",
  }}},
  paths:{"/api/v1/stats":{get:{
    operationId:"getSiteStatistics",
    summary:"Online visitors, today and yesterday",
    security:[{sharingCredential:[]}],
    description:"Days use the stored site timezone (invalid historical zones fall back to UTC), including daylight saving. Online means distinct visitors with an event in the last 300 seconds, not persistent connections. visitors counts distinct visitor IDs, visits distinct session IDs, pageviews only pageview events. IDs follow the tracker daily anonymization scheme. Today is incomplete. Writes are buffered; recent events may appear after a delay. Single-process rate limit: 60 requests/minute/credential; polling every 30–60 seconds is recommended. No cross-origin browser credential support. Never sum daily visitors as unique visitors across days.",
    parameters:[
      {name:"domain",in:"query",required:false,description:"Optional exact stored domain. Must belong to the sharing credential; unrelated sites return 403.",schema:{type:"string",minLength:1,maxLength:255}},
      {name:"period",in:"query",required:false,schema:{type:"string",enum:["summary","live","today","yesterday"],default:"summary"}},
    ],
    responses:{
      "200":{
        description:"Successful aggregate response. No visitor-level data.",
        headers:{"Cache-Control":{schema:{type:"string",const:"no-store"}}},
        content:{"application/json":{schema:{
          type:"object",required:["apiVersion","site","period","generatedAt","onlineWindowSeconds","data"],
          properties:{
            apiVersion:{type:"string",const:"1"},
            site:{type:"object",required:["domain","timezone"],properties:{domain:{type:"string"},timezone:{type:"string"}}},
            period:{type:"string",enum:["summary","live","today","yesterday"]},
            generatedAt:{type:"string",format:"date-time"},
            onlineWindowSeconds:{type:"integer",const:300},
            data:{anyOf:[
              {type:"object",required:["online","today","yesterday"],properties:{online:count,today:daily,yesterday:daily}},
              {type:"object",required:["online"],properties:{online:count}},
              daily,
            ]},
          },
        }}},
      },
      ...errors,
    },
  }}},
}
