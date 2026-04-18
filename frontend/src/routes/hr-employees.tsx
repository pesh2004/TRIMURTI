import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmployeeList } from '@/components/hr/EmployeeList'
import { EmployeeForm } from '@/components/hr/EmployeeForm'
import { EmployeeDrawer } from '@/components/hr/EmployeeDrawer'

export function HrEmployeesPage() {
  const { i18n } = useTranslation()
  const lang = (i18n.language === 'th' ? 'th' : 'en') as 'th' | 'en'

  const [view, setView] = useState<'list' | 'form'>('list')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)

  if (view === 'form') {
    return (
      <EmployeeForm
        lang={lang}
        editingId={editingId}
        onCancel={() => {
          setView('list')
          setEditingId(null)
        }}
        onSaved={() => {
          setView('list')
          setEditingId(null)
        }}
      />
    )
  }

  return (
    <>
      <EmployeeList
        lang={lang}
        onOpenDetail={(id) => setDetailId(id)}
        onNew={() => {
          setEditingId(null)
          setView('form')
          setDetailId(null)
        }}
        onEdit={(id) => {
          setEditingId(id)
          setView('form')
          setDetailId(null)
        }}
      />
      {detailId != null && (
        <EmployeeDrawer
          lang={lang}
          employeeId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(id) => {
            setEditingId(id)
            setView('form')
            setDetailId(null)
          }}
        />
      )}
    </>
  )
}
