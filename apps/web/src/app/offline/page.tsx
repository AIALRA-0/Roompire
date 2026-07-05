import Link from "next/link";
import { RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <main className="flex min-h-svh items-center px-5 py-8 sm:px-8">
      <section className="mx-auto grid w-full max-w-3xl gap-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            R
          </span>
          <span className="text-sm font-semibold text-muted-foreground">Roompire</span>
        </div>

        <div className="grid gap-5 border-l-2 border-primary pl-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-card">
            <WifiOff aria-hidden="true" className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-balance text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
              You are offline
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Roompire keeps financial and household data network-fresh. Reconnect to review
              balances, proposals, settlements, and audit history.
            </p>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              当前网络不可用。为避免展示过期账务数据，请重新联网后继续查看家庭账本、费用和审计记录。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/en-US/app">
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Try again
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/zh-CN/app">重新尝试</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
