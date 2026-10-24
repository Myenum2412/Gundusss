"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  ShieldAlertIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"

import { DashboardShell, PageHeader } from "@/components/dashboard-shell"
import { useAuth } from "@/components/auth-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  createUser,
  deleteUser,
  getUsers,
  updateUser,
} from "@/lib/users"
import {
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type AuthUser,
  type Role,
} from "@/lib/session"

const selectClassName =
  "h-9 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-1 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "viewer" as Role,
  active: true,
}

function formatDate(value?: string): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export default function UsersPage() {
  const { user, can, refresh } = useAuth()
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AuthUser | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const isAdmin = can("users:manage")
  const editingSelf = Boolean(editing && user && editing.id === user.id)

  const reload = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    try {
      setError("")
      const rows = await getUsers()
      setUsers(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users.")
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    void reload()
  }, [reload])

  const adminCount = useMemo(
    () => users.filter((u) => u.role === "admin" && u.active).length,
    [users]
  )

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError("")
    setDialogOpen(true)
  }

  function openEdit(target: AuthUser) {
    setEditing(target)
    setForm({
      name: target.name,
      email: target.email,
      password: "",
      role: target.role,
      active: target.active,
    })
    setFormError("")
    setDialogOpen(true)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError("")

    if (!editing) {
      if (form.password.length < 8) {
        setFormError("Choose a password with at least 8 characters.")
        return
      }
      if (!form.email.trim()) {
        setFormError("Enter an email address.")
        return
      }
    } else if (form.password && form.password.length < 8) {
      setFormError("A new password must be at least 8 characters.")
      return
    }

    setSaving(true)
    try {
      if (editing) {
        await updateUser(editing.id, {
          name: form.name,
          role: form.role,
          active: form.active,
          ...(form.password ? { password: form.password } : {}),
        })
        if (editing.id === user.id) {
          await refresh()
        }
      } else {
        await createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
        })
      }
      setDialogOpen(false)
      await reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the user.")
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(target: AuthUser) {
    const confirmed = window.confirm(
      `Delete ${target.name} (${target.email})? This cannot be undone.`
    )
    if (!confirmed) return

    setDeletingId(target.id)
    setError("")
    try {
      await deleteUser(target.id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the user.")
    } finally {
      setDeletingId(null)
    }
  }

  if (!isAdmin) {
    return (
      <DashboardShell trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Users" }]}>
        <Card className="mx-auto mt-10 max-w-md">
          <CardHeader className="items-center text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <ShieldAlertIcon className="size-5 text-muted-foreground" />
            </div>
            <CardTitle>Administrators only</CardTitle>
            <CardDescription>
              Your account does not have permission to manage users. Ask an
              administrator if you need access.
            </CardDescription>
          </CardHeader>
        </Card>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Users" }]}
      actions={
        <Button size="sm" onClick={openCreate} className="h-8 rounded-[10px]">
          <PlusIcon />
          Add user
        </Button>
      }
    >
      <PageHeader
        title="Users & roles"
        description="Create accounts and choose what each person can do. Roles are enforced by the API on every request."
        meta={
          <Badge variant="outline" className="gap-1">
            <UsersIcon className="size-3" />
            {loading ? "Loading…" : `${users.length} ${users.length === 1 ? "account" : "accounts"}`}
          </Badge>
        }
      />

      {error && (
        <p className="rounded-[10px] border border-destructive/20 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      )}

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-[13px]">Accounts</CardTitle>
          <CardDescription className="text-xs">
            {loading
              ? "Loading accounts…"
              : `${adminCount} active administrator${adminCount === 1 ? "" : "s"} · at least one admin is always required.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading accounts…
            </div>
          ) : users.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No accounts yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((row) => {
                  const self = row.id === user.id
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="pl-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium">
                              {row.name}
                            </span>
                            {self && (
                              <Badge variant="secondary" className="text-[10px]">
                                You
                              </Badge>
                            )}
                          </div>
                          <span className="truncate text-xs text-muted-foreground">
                            {row.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={row.role === "admin" ? "default" : "outline"}
                          className="text-[11px]"
                        >
                          {ROLE_LABELS[row.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            row.active
                              ? "inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"
                              : "inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                          }
                        >
                          <span
                            className={
                              row.active
                                ? "size-1.5 rounded-full bg-emerald-500"
                                : "size-1.5 rounded-full bg-muted-foreground/50"
                            }
                          />
                          {row.active ? "Active" : "Disabled"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(row.created_at)}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Edit user"
                            aria-label={`Edit ${row.name}`}
                            onClick={() => openEdit(row)}
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={
                              self
                                ? "You cannot delete your own account"
                                : "Delete user"
                            }
                            aria-label={`Delete ${row.name}`}
                            disabled={self || deletingId === row.id}
                            onClick={() => void onDelete(row)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            {deletingId === row.id ? (
                              <Loader2Icon className="animate-spin" />
                            ) : (
                              <Trash2Icon />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[13px]">What each role can do</CardTitle>
          <CardDescription className="text-xs">
            Roles are applied immediately. Changes to a signed-in user take
            effect the next time their session is checked.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {ROLES.map((role) => (
            <div key={role} className="rounded-[10px] border bg-muted/20 p-3">
              <p className="text-[13px] font-medium">{ROLE_LABELS[role]}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {ROLE_DESCRIPTIONS[role]}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit user" : "Add a user"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Update the account, role, or password."
                  : "The person signs in with this email and password."}
              </DialogDescription>
            </DialogHeader>

            <Field>
              <FieldLabel htmlFor="user-name">Full name</FieldLabel>
              <Input
                id="user-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Riya Patel"
                autoComplete="off"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="user-email">Email</FieldLabel>
              <Input
                id="user-email"
                type="email"
                required
                disabled={Boolean(editing)}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="person@school.org"
                autoComplete="off"
              />
              {editing && (
                <FieldDescription>
                  Email addresses cannot be changed.
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="user-password">
                {editing ? "New password" : "Password"}
              </FieldLabel>
              <Input
                id="user-password"
                type="password"
                required={!editing}
                minLength={8}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={editing ? "Leave blank to keep current" : "At least 8 characters"}
                autoComplete="new-password"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="user-role">Role</FieldLabel>
              <select
                id="user-role"
                className={selectClassName}
                value={form.role}
                disabled={editingSelf}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value as Role }))
                }
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <FieldDescription>
                {editingSelf
                  ? "You cannot change your own role."
                  : ROLE_DESCRIPTIONS[form.role]}
              </FieldDescription>
            </Field>

            {editing && (
              <label className="flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5 text-sm">
                <span>
                  <span className="font-medium">Account enabled</span>
                  <span className="block text-xs text-muted-foreground">
                    Disabled accounts cannot sign in.
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="size-4 accent-foreground"
                  checked={form.active}
                  disabled={editingSelf}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, active: e.target.checked }))
                  }
                />
              </label>
            )}

            {formError && (
              <p className="rounded-[10px] border border-destructive/20 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2Icon className="animate-spin" />}
                {editing ? "Save changes" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
