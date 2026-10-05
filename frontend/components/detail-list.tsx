export function DetailList({ children }: { children: React.ReactNode }) {
  return <dl className="flex flex-col">{children}</dl>;
}

export function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-border/60 py-2.5 last:border-0">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-[13px] font-medium break-words">
        {children ?? "—"}
      </dd>
    </div>
  );
}
