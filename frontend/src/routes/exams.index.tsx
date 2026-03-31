import { createFileRoute } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { exams } from '../lib/db.js'
import { useSync } from '../lib/sync.js'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.js"
import { Button } from "@/components/ui/button.js"
import { RefreshCw } from "lucide-react"

export const Route = createFileRoute('/exams/')({
  component: ExamsListComponent,
})

function ExamsListComponent() {
  const { data: examsList, isLoading } = useLiveQuery((q) => q.from({ exams }))
  const { sync, isSyncing } = useSync('1') // Hardcoded tenant for demo

  return (
    <div className="container mx-auto p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-extrabold tracking-tight">Exams Dashboard</h1>
        <Button 
          variant="outline" 
          onClick={() => sync()} 
          disabled={isSyncing}
          className="gap-2"
        >
          <RefreshCw className={isSyncing ? "animate-spin" : ""} size={16} />
          Sync with Edge
        </Button>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="animate-spin text-primary" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {examsList?.map((exam) => (
            <Card key={exam.id} className="hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="text-xl">{exam.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
                  {exam.exam_type}
                </p>
                <div className="mt-4 flex gap-2">
                   {/* Badges/Tags can go here */}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && examsList?.length === 0 && (
        <Card className="border-dashed py-20 bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <p className="text-muted-foreground text-lg">No exams found in your local database.</p>
            <Button variant="link" onClick={() => sync()} className="mt-2">
              Try syncing from the cloud
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
