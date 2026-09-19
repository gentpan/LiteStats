import type { ReactNode } from "react"

/** Header contract for management pages; analytics keeps its own toolbar. */
export function ManagementHeader({title,description,children}: {title:ReactNode;description?:string;children?:ReactNode}) {
  return <header className="management-heading"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{children ? <div className="management-heading-actions">{children}</div> : null}</header>
}
