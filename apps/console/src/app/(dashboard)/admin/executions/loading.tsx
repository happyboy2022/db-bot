export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="mt-2 h-4 w-96 animate-pulse rounded bg-gray-100" />
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-10 w-full animate-pulse rounded bg-gray-100" />
          </div>
          <div className="h-10 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <div className="divide-y">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-64 animate-pulse rounded bg-gray-200" />
                  <div className="h-3 w-96 animate-pulse rounded bg-gray-100" />
                  <div className="h-3 w-48 animate-pulse rounded bg-gray-100" />
                </div>
                <div className="h-8 w-16 animate-pulse rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
