"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TopicInfo {
  topic: number;
  totalQuestions: number;
}

interface TopicListProps {
  slug: string;
  topics: TopicInfo[];
  basePath: string;
}

export function TopicList({ slug, topics, basePath }: TopicListProps) {
  const router = useRouter();

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {topics.map(({ topic, totalQuestions }) => (
        <Card
          key={topic}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() =>
            router.push(`${basePath}/quiz?dataset=${slug}&topic=${topic}&filter=all`)
          }
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Topic {topic}</Badge>
                <span className="text-sm text-muted-foreground">{totalQuestions} questions</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
