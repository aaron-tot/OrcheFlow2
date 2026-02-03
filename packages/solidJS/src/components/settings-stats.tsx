import { Component, createMemo, createSignal, createResource, For, Show, onMount } from "solid-js"
import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import { ScrollFade } from "@opencode-ai/ui/scroll-fade"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { useGlobalSDK } from "@/context/global-sdk"

type DateRange = "24h" | "7d" | "30d" | "all"
type SortBy = "cost" | "requests" | "tokens"

interface ProviderStats {
  provider: string
  requests: number
  totalCost: number
  totalInput: number
  totalOutput: number
  totalTokens: number
  avgCostPerRequest: number
  models: Set<string>
}

const formatCost = (cost: number): string => {
  if (cost === 0) return "$0.00"
  if (cost < 0.0001) return "<$0.0001"
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(3)}`
}

const formatNumber = (num: number): string => {
  return num.toLocaleString()
}

export const SettingsStats: Component = () => {
  const language = useLanguage()
  const globalSDK = useGlobalSDK()
  const [dateRange, setDateRange] = createSignal<DateRange>("7d")
  const [sortBy, setSortBy] = createSignal<SortBy>("cost")
  const [refreshTrigger, setRefreshTrigger] = createSignal(0)

  // Fetch all messages from all sessions
  const [allMessages, { refetch }] = createResource(refreshTrigger, async () => {
    console.log("[Stats] Fetching messages, trigger:", refreshTrigger())
    const messages: AssistantMessage[] = []

    try {
      // Get list of all sessions across all directories
      const sessionsResult = await globalSDK.client.session.list()
      console.log("[Stats] Session list result:", sessionsResult)
      console.log("[Stats] Sessions data:", sessionsResult.data)
      console.log("[Stats] Found sessions:", sessionsResult.data?.sessions?.length || 0)
      
      if (!sessionsResult.data?.sessions || sessionsResult.data.sessions.length === 0) {
        console.log("[Stats] No sessions found, returning empty array")
        return messages
      }

      console.log("[Stats] Processing sessions:", sessionsResult.data.sessions.map(s => ({ id: s.id, directory: s.directory })))

      // Fetch messages for each session
      await Promise.all(
        sessionsResult.data.sessions.map(async (session) => {
          try {
            console.log(`[Stats] Fetching messages for session ${session.id} in ${session.directory}`)
            const result = await globalSDK.client.session.messages({
              directory: session.directory,
              sessionID: session.id,
            })
            
            console.log(`[Stats] Session ${session.id} has ${result.data.messages.length} messages`)

            result.data.messages.forEach((msg) => {
              if (msg.role === "assistant") {
                messages.push(msg as AssistantMessage)
              }
            })
          } catch (err) {
            console.error(`[Stats] Failed to fetch messages for session ${session.id}:`, err)
          }
        })
      )
    } catch (err) {
      console.error("[Stats] Failed to fetch sessions:", err)
    }

    console.log("[Stats] Total assistant messages fetched:", messages.length)
    return messages
  })

  // Listen for message events and refresh
  onMount(() => {
    let timeout: NodeJS.Timeout | undefined
    
    const unsub = globalSDK.event.listen((event) => {
      console.log("[Stats] Event received:", event.type)
      
      // Refresh when messages are updated
      if (
        event.type === "message.updated" ||
        event.type === "message.part.updated" ||
        event.type === "session.updated"
      ) {
        // Debounce refreshes - only trigger once per second
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(() => {
          console.log("[Stats] Refreshing stats...")
          setRefreshTrigger((prev) => prev + 1)
        }, 1000)
      }
    })

    return () => {
      if (timeout) clearTimeout(timeout)
      unsub()
    }
  })

  // Filter messages by date range
  const filteredMessages = createMemo(() => {
    const range = dateRange()
    const messages = allMessages() || []

    if (range === "all" || messages.length === 0) {
      return messages
    }

    const now = Date.now()
    const ranges = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    }

    const cutoff = now - ranges[range]
    return messages.filter((m) => m.time.created >= cutoff)
  })

  // Aggregate stats by provider
  const providerStats = createMemo(() => {
    const stats = new Map<string, ProviderStats>()

    filteredMessages().forEach((msg) => {
      if (!msg.providerID || msg.cost === undefined) return

      const provider = msg.providerID
      if (!stats.has(provider)) {
        stats.set(provider, {
          provider,
          requests: 0,
          totalCost: 0,
          totalInput: 0,
          totalOutput: 0,
          totalTokens: 0,
          avgCostPerRequest: 0,
          models: new Set(),
        })
      }

      const stat = stats.get(provider)!
      stat.requests += 1
      stat.totalCost += msg.cost
      stat.totalInput += msg.tokens?.input || 0
      stat.totalOutput += msg.tokens?.output || 0
      stat.totalTokens += (msg.tokens?.input || 0) + (msg.tokens?.output || 0)

      if (msg.modelID) {
        stat.models.add(msg.modelID)
      }
    })

    // Calculate averages
    stats.forEach((stat) => {
      stat.avgCostPerRequest = stat.requests > 0 ? stat.totalCost / stat.requests : 0
    })

    // Convert to array and sort
    const sortedStats = Array.from(stats.values())

    switch (sortBy()) {
      case "cost":
        sortedStats.sort((a, b) => b.totalCost - a.totalCost)
        break
      case "requests":
        sortedStats.sort((a, b) => b.requests - a.requests)
        break
      case "tokens":
        sortedStats.sort((a, b) => b.totalTokens - a.totalTokens)
        break
    }

    return sortedStats
  })

  // Calculate totals
  const totals = createMemo(() => {
    return providerStats().reduce(
      (acc, stat) => ({
        requests: acc.requests + stat.requests,
        cost: acc.cost + stat.totalCost,
        tokens: acc.tokens + stat.totalTokens,
      }),
      { requests: 0, cost: 0, tokens: 0 }
    )
  })

  return (
    <ScrollFade
      direction="vertical"
      fadeStartSize={0}
      fadeEndSize={16}
      class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10"
    >
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-raised-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8">
          <div class="flex items-center justify-between">
            <div class="flex flex-col gap-1">
              <h2 class="text-16-medium text-text-strong">Usage Statistics</h2>
              <p class="text-12-regular text-text-weak">Track your AI usage, costs, and token consumption</p>
            </div>
            <Button
              size="small"
              variant="secondary"
              onClick={() => {
                console.log("[Stats] Manual refresh clicked")
                setRefreshTrigger((prev) => prev + 1)
              }}
              disabled={allMessages.loading}
            >
              <Icon name="refresh-cw" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-6 w-full">
        {/* Debug Info */}
        <div class="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg text-12-regular">
          <div class="font-mono">
            <div>Loading: {allMessages.loading ? "true" : "false"}</div>
            <div>Messages: {allMessages()?.length || 0}</div>
            <div>Filtered: {filteredMessages().length}</div>
            <div>Providers: {providerStats().length}</div>
            <div>Total Cost: {formatCost(totals().cost)}</div>
            <div>Refresh Trigger: {refreshTrigger()}</div>
          </div>
        </div>

        <Show when={!allMessages.loading} fallback={
          <div class="bg-surface-raised-base p-12 rounded-lg text-center">
            <div class="text-14-medium text-text-weak">Loading usage statistics...</div>
          </div>
        }>
          {/* Date Range Filter */}
          <div class="bg-surface-raised-base px-4 py-3 rounded-lg">
          <div class="flex items-center justify-between">
            <span class="text-14-medium text-text-strong">Time Range</span>
            <div class="flex gap-2">
              <For each={["24h", "7d", "30d", "all"] as DateRange[]}>
                {(range) => (
                  <button
                    onClick={() => setDateRange(range)}
                    class={`px-3 py-1.5 text-12-medium rounded-lg transition-colors ${
                      dateRange() === range
                        ? "bg-surface-action-base text-text-on-action"
                        : "bg-surface-raised-base text-text-weak hover:bg-surface-raised-hovered"
                    }`}
                  >
                    {range === "24h" && "Last 24 Hours"}
                    {range === "7d" && "Last 7 Days"}
                    {range === "30d" && "Last 30 Days"}
                    {range === "all" && "All Time"}
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div class="grid grid-cols-3 gap-4">
          <div class="bg-surface-raised-base p-4 rounded-lg">
            <div class="text-12-regular text-text-weak mb-2">Total Requests</div>
            <div class="text-24-medium text-text-strong font-mono">{formatNumber(totals().requests)}</div>
          </div>
          <div class="bg-surface-raised-base p-4 rounded-lg">
            <div class="text-12-regular text-text-weak mb-2">Total Tokens</div>
            <div class="text-24-medium text-text-strong font-mono">{formatNumber(totals().tokens)}</div>
          </div>
          <div class="bg-surface-raised-base p-4 rounded-lg">
            <div class="text-12-regular text-text-weak mb-2">Total Cost</div>
            <div class="text-24-medium text-green-600 font-mono">{formatCost(totals().cost)}</div>
          </div>
        </div>

        <Show
          when={providerStats().length > 0}
          fallback={
            <div class="bg-surface-raised-base p-12 rounded-lg text-center">
              <div class="text-14-medium text-text-weak mb-2">No usage data available</div>
              <div class="text-12-regular text-text-weak">
                Start sending messages to see your usage analytics and cost breakdown.
              </div>
            </div>
          }
        >
          {/* Provider Breakdown Section */}
          <div class="bg-surface-raised-base px-4 py-4 rounded-lg">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-14-medium text-text-strong">Provider Breakdown</h3>
              <div class="flex gap-2">
                <For each={["cost", "requests", "tokens"] as SortBy[]}>
                  {(sort) => (
                    <button
                      onClick={() => setSortBy(sort)}
                      class={`px-3 py-1.5 text-12-medium rounded-lg transition-colors ${
                        sortBy() === sort
                          ? "bg-surface-action-base text-text-on-action"
                          : "bg-surface-raised-base text-text-weak hover:bg-surface-raised-hovered"
                      }`}
                    >
                      {sort === "cost" && "By Cost"}
                      {sort === "requests" && "By Requests"}
                      {sort === "tokens" && "By Tokens"}
                    </button>
                  )}
                </For>
              </div>
            </div>

            {/* Provider Table */}
            <div class="border border-border-weak-base rounded-lg overflow-hidden">
              <table class="w-full">
                <thead class="bg-surface-raised-hovered">
                  <tr class="border-b border-border-weak-base">
                    <th class="text-left py-2 px-3 text-12-medium text-text-weak">Provider</th>
                    <th class="text-right py-2 px-3 text-12-medium text-text-weak">Requests</th>
                    <th class="text-right py-2 px-3 text-12-medium text-text-weak">Tokens</th>
                    <th class="text-right py-2 px-3 text-12-medium text-text-weak">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={providerStats()}>
                    {(stat) => (
                      <tr class="border-b border-border-weak-base last:border-b-0 hover:bg-surface-raised-hovered">
                        <td class="py-3 px-3">
                          <div class="flex flex-col gap-0.5">
                            <div class="text-14-medium text-text-strong">{stat.provider}</div>
                            <div class="text-12-regular text-text-weak">
                              {stat.models.size} model{stat.models.size !== 1 ? "s" : ""}
                            </div>
                          </div>
                        </td>
                        <td class="text-right py-3 px-3 text-14-regular text-text-strong font-mono">
                          {formatNumber(stat.requests)}
                        </td>
                        <td class="text-right py-3 px-3">
                          <div class="text-12-regular text-text-strong font-mono">
                            {formatNumber(stat.totalInput)} in
                          </div>
                          <div class="text-12-regular text-text-weak font-mono">
                            {formatNumber(stat.totalOutput)} out
                          </div>
                        </td>
                        <td class="text-right py-3 px-3 text-14-medium text-green-600 font-mono">
                          {formatCost(stat.totalCost)}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        </Show>
        </Show>
      </div>
    </ScrollFade>
  )
}
