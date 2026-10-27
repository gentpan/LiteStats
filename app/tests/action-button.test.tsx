import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { ActionButton, ActionLink, ActionUpload } from "../src/components/ActionButton"

test("button, link and upload actions share the same component structure and variants", async () => {
  const root = createRootRoute({component: () => <ActionLink to="/dashboard" className="btn-primary settings-back">Back</ActionLink>})
  const router = createRouter({routeTree: root, history: createMemoryHistory({initialEntries: ["/"]})})
  await router.load()
  const link = renderToStaticMarkup(<RouterProvider router={router} />)
  const button = renderToStaticMarkup(<ActionButton className="btn-primary settings-back">Back</ActionButton>)
  const upload = renderToStaticMarkup(<ActionUpload className="btn-primary settings-back">Upload</ActionUpload>)
  for (const html of [link, button, upload]) {
    expect(html).toContain("ui-action")
    expect(html).toContain('data-variant="primary"')
    expect(html).toContain("settings-back")
    expect(html).not.toContain("btn-sm")
  }
  expect(link).toContain("<a")
  expect(button).toContain("<button")
  expect(upload).toContain("<label")
  expect(upload).toContain('type="file"')
})
