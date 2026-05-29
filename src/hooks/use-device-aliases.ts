import { useState, useEffect } from 'react'

export function useDeviceAliases() {
  const [aliases, setAliases] = useState<Record<string, string>>({})

  useEffect(() => {
    const saved = localStorage.getItem("device-aliases")
    if (saved) {
      try {
        setAliases(JSON.parse(saved))
      } catch (e) {
        console.error("Failed to parse device aliases")
      }
    }
  }, [])

  const setAlias = (macAddress: string, name: string) => {
    setAliases((prev) => {
      const updated = { ...prev }
      if (!name.trim()) {
        delete updated[macAddress]
      } else {
        updated[macAddress] = name.trim()
      }
      localStorage.setItem("device-aliases", JSON.stringify(updated))
      return updated
    })
  }

  const getAlias = (macAddress: string): string | undefined => {
    return aliases[macAddress]
  }

  return { aliases, setAlias, getAlias }
}
