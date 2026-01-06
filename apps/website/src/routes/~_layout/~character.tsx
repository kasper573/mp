import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_layout/character')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_layout/character"!</div>
}
