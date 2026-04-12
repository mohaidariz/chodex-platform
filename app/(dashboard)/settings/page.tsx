'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Settings, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Organization } from '@/types'

export default function SettingsPage() {
  const [org, setOrg] = useState<Partial<Organization>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const fetchOrg = useCallback(async () => {
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile?.org_id) return

    const { data } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', profile.org_id)
      .single()

    if (data) setOrg(data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchOrg()
  }, [fetchOrg])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)

    const { error: updateError } = await supabase
      .from('organizations')
      .update({
        name: org.name,
        email_from: org.email_from,
        email_reply_to: org.email_reply_to,
      })
      .eq('id', org.id!)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 bg-slate-200 rounded w-40 animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-slate-600" />
          Settings
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Manage your organization and email configuration.
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Organization settings */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-900 mb-1">Organization</h2>
          <p className="text-sm text-slate-500 mb-6">Basic organization information.</p>

          <form onSubmit={handleSave} className="space-y-4">
            <Input
              id="orgName"
              label="Organization name"
              value={org.name ?? ''}
              onChange={(e) => setOrg((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Slug</label>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="text-slate-400 text-sm">{process.env.NEXT_PUBLIC_APP_URL}/chatbot/</span>
                <code className="text-sm text-slate-700 font-mono">{org.slug}</code>
              </div>
              <p className="text-xs text-slate-400 mt-1">Slug cannot be changed after creation.</p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Plan</label>
              <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-sm text-blue-700 font-medium capitalize">
                {org.plan ?? 'free'}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="font-medium text-slate-800 mb-3 text-sm">Email configuration</h3>
              <div className="space-y-3">
                <Input
                  id="emailFrom"
                  label="From address"
                  type="email"
                  placeholder="noreply@yourcompany.com"
                  value={org.email_from ?? ''}
                  onChange={(e) => setOrg((prev) => ({ ...prev, email_from: e.target.value }))}
                />
                <Input
                  id="emailReplyTo"
                  label="Reply-to address"
                  type="email"
                  placeholder="support@yourcompany.com"
                  value={org.email_reply_to ?? ''}
                  onChange={(e) => setOrg((prev) => ({ ...prev, email_reply_to: e.target.value }))}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {saved && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <p className="text-sm text-green-600">Settings saved successfully!</p>
              </div>
            )}

            <Button type="submit" loading={saving} className="flex items-center gap-2">
              <Save className="w-4 h-4" />
              Save changes
            </Button>
          </form>
        </div>

        {/* Danger zone */}
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6">
          <h2 className="font-semibold text-red-600 mb-1">Danger Zone</h2>
          <p className="text-sm text-slate-500 mb-4">
            These actions are irreversible. Please be certain.
          </p>
          <Button variant="danger" onClick={() => alert('Contact support to delete your organization.')}>
            Delete organization
          </Button>
        </div>
      </div>
    </div>
  )
}
