import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/admin/spectator')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/admin/spectator"!</div>
}
