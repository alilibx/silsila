import { useState } from "react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field, PageHeader, PersonAvatar, Pill, ask } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ago, date } from "@/lib/format";
import { change, PAGE_ACCESS, PERMISSIONS, ROLE_LABEL, useCan, useDb, usePhone, useRole } from "@/lib/store";
import type { Admin, Role } from "@/lib/types";

const ROLES: Role[] = ["owner", "support", "viewer"];
const ROLE_HINT: Record<Role, string> = {
  owner: "كل شيء، ويشمل الحذف والإعدادات وإدارة الفريق",
  support: "يساعد الناس: يرد ويعدّل ويحظر، ولا يدخل الإعدادات والفريق",
  viewer: "يطّلع على الأشخاص والختمات فقط، والأرقام مخفية جزئياً",
};

function AddAdmin({ onClose }: { onClose: () => void }) {
  const db = useDb();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+971");
  const [role, setRole] = useState<Role>("support");
  const taken = db.admins.some((a) => a.phone === phone);
  const valid = name.trim().length > 1 && /^\+[1-9]\d{7,14}$/.test(phone) && !taken;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة مشرف</DialogTitle>
          <DialogDescription>يدخل برقمه عبر واتساب، ويصل تنبيه مع كل دخول.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="الاسم">
            <Input id="admin-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="رقم الهاتف">
            <Input id="admin-phone" dir="ltr" className="text-start" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {taken && <p className="text-xs text-destructive">هذا الرقم مشرف بالفعل.</p>}
          </Field>
          <Field label="الدور">
            <Select dir="rtl" value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_HINT[role]}</p>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              const admin: Admin = { id: `a${Date.now()}`, name: name.trim(), phone, role, addedAt: Date.now(), lastActiveAt: Date.now(), notifyHelp: true, notifySummary: true, notifyMilestones: true };
              change((d) => ({ ...d, admins: [...d.admins, admin] }), {
                action: "إضافة مشرف",
                targetKind: "admin",
                targetId: admin.id,
                targetLabel: admin.name,
                before: null,
                after: ROLE_LABEL[role],
                note: null,
              });
              toast.success("أُضيف المشرف");
              onClose();
            }}
          >
            إضافة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NOTIFY: { key: "notifyHelp" | "notifySummary" | "notifyMilestones"; label: string; what: string }[] = [
  { key: "notifyHelp", label: "طلبات المساعدة", what: "تنبيه عند وصول طلب جديد." },
  { key: "notifySummary", label: "الملخص الصباحي", what: "ملخص أمس في الصباح." },
  { key: "notifyMilestones", label: "الإنجازات", what: "عند بلوغ أرقام مهمة." },
];

export function TeamPage() {
  const db = useDb();
  const can = useCan();
  const phone = usePhone();
  const role = useRole();
  const me = db.admins.find((a) => a.role === role) ?? db.admins[0];
  const manage = can("team.manage");
  const [adding, setAdding] = useState(false);
  const owners = db.admins.filter((a) => a.role === "owner").length;

  const setRole = (admin: Admin, role: Role) => {
    if (admin.role === "owner" && owners === 1) {
      toast.error("لا بد من مالك واحد على الأقل");
      return;
    }
    change((d) => ({ ...d, admins: d.admins.map((a) => (a.id === admin.id ? { ...a, role } : a)) }), {
      action: "تغيير دور مشرف",
      targetKind: "admin",
      targetId: admin.id,
      targetLabel: admin.name,
      before: ROLE_LABEL[admin.role],
      after: ROLE_LABEL[role],
      note: null,
    });
    toast.success("تغيّر الدور");
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <PageHeader
        title="الفريق والأدوار"
        description="من يدخل هذه اللوحة وماذا يستطيع أن يفعل."
        actions={
          manage && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus /> إضافة مشرف
            </Button>
          )
        }
      />
      <Tabs dir="rtl" defaultValue="admins">
        <TabsList>
          <TabsTrigger value="admins">المشرفون</TabsTrigger>
          <TabsTrigger value="roles">الأدوار والصلاحيات</TabsTrigger>
          <TabsTrigger value="mine">إشعاراتي</TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="mt-3">
          <ul className="divide-y rounded-lg border bg-card text-[13px]">
            {NOTIFY.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span>
                  <span className="block font-medium">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.what}</span>
                </span>
                <Switch
                  aria-label={item.label}
                  checked={me[item.key]}
                  onCheckedChange={(on) =>
                    change((d) => ({ ...d, admins: d.admins.map((a) => (a.id === me.id ? { ...a, [item.key]: on } : a)) }))
                  }
                />
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="admins" className="mt-3">
          <ul className="divide-y rounded-lg border bg-card">
            {db.admins.map((admin) => (
              <li key={admin.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-[13px]">
                <PersonAvatar name={admin.name} />
                <div className="min-w-0 grow basis-40">
                  <p className="font-medium">{admin.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="ltr-text">{phone(admin.phone)}</span> · نشط {ago(admin.lastActiveAt)} · أُضيف {date(admin.addedAt)}
                  </p>
                </div>
                {manage ? (
                  <Select dir="rtl" value={admin.role} onValueChange={(v) => setRole(admin, v as Role)}>
                    <SelectTrigger size="sm" className="w-28" aria-label={`دور ${admin.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Pill tone="info">{ROLE_LABEL[admin.role]}</Pill>
                )}
                {manage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                    aria-label={`إزالة ${admin.name}`}
                    disabled={admin.role === "owner" && owners === 1}
                    onClick={() =>
                      ask({
                        title: `إزالة ${admin.name}؟`,
                        body: "تنتهي جلساته وتتوقف إشعاراته فوراً.",
                        confirm: "إزالة",
                        destructive: true,
                        note: true,
                        onConfirm: (note) => {
                          change((d) => ({ ...d, admins: d.admins.filter((a) => a.id !== admin.id) }), {
                            action: "إزالة مشرف",
                            targetKind: "admin",
                            targetId: admin.id,
                            targetLabel: admin.name,
                            before: ROLE_LABEL[admin.role],
                            after: null,
                            note,
                          });
                          toast.success("أُزيل المشرف");
                        },
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="roles" className="mt-3 grid grid-cols-1 gap-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {ROLES.map((role) => (
              <div key={role} className="rounded-lg border bg-card p-3">
                <p className="text-[13px] font-medium">{ROLE_LABEL[role]}</p>
                <p className="text-xs text-muted-foreground">{ROLE_HINT[role]}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs">الصفحات</TableHead>
                  {ROLES.map((role) => (
                    <TableHead key={role} className="text-center text-xs">
                      {ROLE_LABEL[role]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {PAGE_ACCESS.map((row) => (
                  <TableRow key={row.page}>
                    <TableCell className="py-2 text-[13px]">{row.label}</TableCell>
                    {ROLES.map((role) => (
                      <TableCell key={role} className="py-2 text-center">
                        {row.roles.includes(role) ? (
                          <Check className="mx-auto size-4 text-good" aria-label="مسموح" />
                        ) : (
                          <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="غير مسموح" />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs">الأفعال</TableHead>
                  {ROLES.map((role) => (
                    <TableHead key={role} className="text-center text-xs">
                      {ROLE_LABEL[role]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {PERMISSIONS.map((permission) => (
                  <TableRow key={permission.key}>
                    <TableCell className="py-2 text-[13px]">{permission.label}</TableCell>
                    {ROLES.map((role) => (
                      <TableCell key={role} className="py-2 text-center">
                        {permission.roles.includes(role) ? (
                          <Check className="mx-auto size-4 text-good" aria-label="مسموح" />
                        ) : (
                          <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="غير مسموح" />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            في البناء الحقيقي تُفحص الصلاحيات في الخادم، فإخفاء الزر وحده لا يكفي.
          </p>
        </TabsContent>
      </Tabs>
      {adding && <AddAdmin onClose={() => setAdding(false)} />}
    </div>
  );
}
