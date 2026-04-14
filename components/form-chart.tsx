"use client"

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"

interface FormDataPoint {
  matchIndex: number
  date: string
  tournament: string
  round: string
  won: boolean
  winRate: number
}

export function FormChart({ data }: { data: FormDataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="text-gray-500 text-center py-8">
        No match data available
      </div>
    )
  }

  return (
    <div className="w-full h-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <XAxis
            dataKey="matchIndex"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <ReferenceLine y={50} stroke="#374151" strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#f9fafb',
              fontSize: '13px',
            }}
            formatter={(value: number) => [`${value}%`, 'Win Rate']}
            labelFormatter={(label) => {
              const point = data.find(d => d.matchIndex === label)
              if (!point) return `Match ${label}`
              return `${point.tournament} (${point.round})`
            }}
          />
          <Line
            type="monotone"
            dataKey="winRate"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={(props: Record<string, unknown>) => {
              const { cx, cy, index } = props as { cx: number; cy: number; index: number }
              const point = data[index]
              if (!point) return <circle key={index} />
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill={point.won ? '#22c55e' : '#ef4444'}
                  stroke={point.won ? '#22c55e' : '#ef4444'}
                  strokeWidth={2}
                />
              )
            }}
            activeDot={{ r: 6, fill: '#3b82f6' }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Win
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Loss
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-blue-500 inline-block" /> Win Rate Trend
        </span>
      </div>
    </div>
  )
}
