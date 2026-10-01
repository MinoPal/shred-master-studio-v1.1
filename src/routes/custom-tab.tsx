import { createFileRoute } from '@tanstack/react-router'
import CustomTabPlayer from '@/components/CustomTabPlayer'

export const Route = createFileRoute('/custom-tab')({
  component: CustomTabPlayer,
})