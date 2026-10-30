import {createContext,useContext} from "react"
export const ReferenceContext=createContext<any>({data:{},search:{},params:{}})
export const Route={useLoaderData:()=>useContext(ReferenceContext).data,useSearch:()=>useContext(ReferenceContext).search,useParams:()=>useContext(ReferenceContext).params}
