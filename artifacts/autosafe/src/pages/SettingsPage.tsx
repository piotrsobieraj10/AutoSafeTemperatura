import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { APP_VERSION } from "@/config/app";
import { isAdvertisementScanSupported, isBluetoothAvailable, isLEScanSupported } from "@/services/bluetoothService";
import { sensorProfiles } from "@/services/sensorProfiles";
import { clearAlerts, clearAllMeasurements, clearLocalAppData, createBackupJson, createSensorGroup, deleteSensorGroup, downloadTextFile, exportCsv, getMeasurements, getSensorGroups, getSettings, importBackupJson, openHtmlReport, patchSettings, saveSensorGroups } from "@/services/storageService";
import { GROUP_ICON_OPTIONS, getGroupIcon } from "@/services/sensorUiService";
import type { AppSettings, SensorGroup } from "@/types/sensor";
import { Bell, Bluetooth, Database, Download, FileText, Info, Moon, Plus, Radio, Settings2, Smartphone, Sun, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

export function SettingsPage() {
  const [s, setS] = useState<AppSettings>(() => getSettings());
  const [groups, setGroups] = useState<SensorGroup[]>(() => getSensorGroups());
  const [newGroup, setNewGroup] = useState("");
  const [btOk, setBtOk] = useState<boolean | null>(null);
  const [msCount, setMsCount] = useState(() => getMeasurements().length);
  const leOk = isLEScanSupported();
  const advOk = isAdvertisementScanSupported();

  useEffect(() => { isBluetoothAvailable().then(setBtOk); }, []);
  const update = (patch: Partial<AppSettings>) => { const next = { ...getSettings(), ...patch }; patchSettings(patch); setS(next); };
  const refreshGroups = () => setGroups(getSensorGroups());

  const importFile = async (file?: File) => {
    if (!file) return;
    try { importBackupJson(await file.text()); setMsCount(getMeasurements().length); refreshGroups(); toast.success("Import zakończony."); }
    catch { toast.error("Nie udało się zaimportować backupu JSON."); }
  };

  const addGroup = () => {
    if (!newGroup.trim()) return;
    createSensorGroup(newGroup.trim(), "floor");
    setNewGroup(""); refreshGroups(); toast.success("Dodano grupę czujników.");
  };

  const renameGroup = (id: string, name: string) => { saveSensorGroups(groups.map((g) => g.id === id ? { ...g, name } : g)); refreshGroups(); };
  const changeGroupIcon = (id: string, icon: SensorGroup["icon"]) => { saveSensorGroups(groups.map((g) => g.id === id ? { ...g, icon } : g)); refreshGroups(); };

  return (
    <div className="space-y-5">
      <div><h1 className="font-display text-3xl font-black">Ustawienia</h1><p className="text-sm text-muted-foreground">Kompaktowe ustawienia aplikacji, odświeżania, grup i diagnostyki.</p></div>

      <Accordion type="multiple" defaultValue={["refresh", "groups"]} className="space-y-3">
        <SettingsSection value="appearance" title="Wygląd aplikacji" icon={<Settings2 className="h-4 w-4" />}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Row label="Motyw"><Select value={s.theme} onValueChange={(v) => update({ theme: v as AppSettings["theme"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Jasny</SelectItem><SelectItem value="dark">Ciemny</SelectItem><SelectItem value="system">Auto/systemowy</SelectItem></SelectContent></Select></Row>
            <Row label="Gęstość pulpitu"><Select value={s.dashboardDensity ?? "compact"} onValueChange={(v) => update({ dashboardDensity: v as AppSettings["dashboardDensity"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="compact">Kompaktowa</SelectItem><SelectItem value="comfortable">Wygodna</SelectItem></SelectContent></Select></Row>
            <Row label="Jednostka temperatury"><Select value={s.tempUnit} onValueChange={(v) => update({ tempUnit: v as AppSettings["tempUnit"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="C">°C</SelectItem><SelectItem value="F">°F</SelectItem></SelectContent></Select></Row>
            <Row label="Zakres wykresu"><Select value={s.chartDefaultRange} onValueChange={(v) => update({ chartDefaultRange: v as AppSettings["chartDefaultRange"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1h">1 godzina</SelectItem><SelectItem value="24h">24 godziny</SelectItem><SelectItem value="7d">7 dni</SelectItem></SelectContent></Select></Row>
          </div>
        </SettingsSection>

        <SettingsSection value="refresh" title="Odświeżanie i monitoring" icon={<Radio className="h-4 w-4" />}>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3"><Label>Automatycznie odświeżaj przy otwartej aplikacji</Label><Switch checked={s.foregroundRefreshEnabled ?? true} onCheckedChange={(v) => update({ foregroundRefreshEnabled: v })} /></div>
            <Row label="Częstotliwość przy otwartej aplikacji"><Select value={String(s.foregroundRefreshIntervalMs ?? 30000)} onValueChange={(v) => update({ foregroundRefreshIntervalMs: Number(v) as AppSettings["foregroundRefreshIntervalMs"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">Ręcznie</SelectItem><SelectItem value="15000">15 sekund</SelectItem><SelectItem value="30000">30 sekund</SelectItem><SelectItem value="60000">60 sekund</SelectItem><SelectItem value="120000">2 minuty</SelectItem></SelectContent></Select></Row>
            <Row label="Monitoring w tle"><Select value={s.backgroundMonitoringMode ?? "eco"} onValueChange={(v) => update({ backgroundMonitoringMode: v as AppSettings["backgroundMonitoringMode"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="off">Wyłączony</SelectItem><SelectItem value="eco">Oszczędny — co 5 min, skan 20 s</SelectItem><SelectItem value="normal">Normalny — co 2 min, skan 20 s</SelectItem><SelectItem value="test">Testowy — co 30 s maks. 15 min</SelectItem></SelectContent></Select></Row>
            <Alert><Info className="h-4 w-4" /><AlertTitle>Monitoring w tle — etap v6.1</AlertTitle><AlertDescription className="text-xs">Opcje są przygotowane. Stabilne działanie w tle w Android APK wymaga Foreground Service ze stałym powiadomieniem, aby Android nie ubijał aplikacji i nie zużywać nadmiernie baterii.</AlertDescription></Alert>
          </div>
        </SettingsSection>

        <SettingsSection value="groups" title="Czujniki i grupy" icon={<Smartphone className="h-4 w-4" />}>
          <div className="space-y-3">
            <div className="flex gap-2"><Input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="np. Parter, Piętro, Garaż" /><Button onClick={addGroup}><Plus className="mr-2 h-4 w-4" />Dodaj</Button></div>
            <div className="space-y-2">{groups.map((g) => <GroupEditor key={g.id} group={g} onRename={renameGroup} onIcon={changeGroupIcon} onDelete={() => { if (deleteSensorGroup(g.id)) { refreshGroups(); toast.success("Grupa usunięta."); } else toast.warning("Nie można usunąć grupy, która ma przypisane czujniki."); }} />)}</div>
          </div>
        </SettingsSection>

        <SettingsSection value="supported" title="Obsługiwane czujniki" icon={<Bluetooth className="h-4 w-4" />}>
          <div className="space-y-2">{sensorProfiles.map((p) => <div key={p.id} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5 text-sm"><div><span className="font-semibold">{p.name}</span><span className="ml-2 text-xs text-muted-foreground">{p.manufacturer}</span></div><div className="flex gap-1.5"><Badge variant="outline" className="text-[10px]">{p.source === "advertisement" ? "Adv" : "GATT"}</Badge>{p.supportsHumidity && <Badge variant="secondary" className="text-[10px]">RHT</Badge>}</div></div>)}</div>
          <Alert className="mt-3 border-primary/30 bg-primary/5"><Info className="h-4 w-4 text-primary" /><AlertDescription className="text-xs">ELA: 0x2A6E temperatura, 0x2A6F wilgotność RHT, 0x0757 bateria mV.</AlertDescription></Alert>
        </SettingsSection>

        <SettingsSection value="data" title="Dane i kopie zapasowe" icon={<Database className="h-4 w-4" />}>
          <p className="mb-3 text-xs text-muted-foreground">{msCount.toLocaleString("pl-PL")} pomiarów zapisanych lokalnie.</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => downloadTextFile(`autosafe-temperatura-${new Date().toISOString().slice(0,10)}.csv`, exportCsv(), "text/csv;charset=utf-8")}><Download className="mr-2 h-4 w-4" />CSV</Button><Button variant="outline" size="sm" onClick={() => downloadTextFile(`autosafe-temperatura-backup-${new Date().toISOString().slice(0,10)}.json`, createBackupJson(), "application/json;charset=utf-8")}><Download className="mr-2 h-4 w-4" />Backup JSON</Button><Button variant="outline" size="sm" onClick={openHtmlReport}><FileText className="mr-2 h-4 w-4" />Raport</Button><label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"><Upload className="mr-2 h-4 w-4" />Import JSON<input type="file" accept="application/json" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} /></label><Button variant="outline" size="sm" onClick={() => { clearAlerts(); toast.success("Alerty wyczyszczone."); }}><Bell className="mr-2 h-4 w-4" />Wyczyść alerty</Button><Button variant="destructive" size="sm" onClick={() => { if (confirm("Usunąć całą historię pomiarów?")) { clearAllMeasurements(); toast.success("Historia wyczyszczona."); setMsCount(0); } }}><Trash2 className="mr-2 h-4 w-4" />Usuń historię</Button><Button variant="destructive" size="sm" onClick={() => { if (confirm("Wyczyścić wszystkie lokalne dane aplikacji?")) { clearLocalAppData(); setTimeout(() => window.location.reload(), 500); } }}><Trash2 className="mr-2 h-4 w-4" />Wyczyść aplikację</Button></div>
        </SettingsSection>

        <SettingsSection value="diagnostics" title="Diagnostyka BLE" icon={<Bluetooth className="h-4 w-4" />}>
          <div className="space-y-3"><div className="flex items-center justify-between"><Label>Pokaż diagnostykę BLE na kartach/szczegółach</Label><Switch checked={s.showBleDiagnostics ?? false} onCheckedChange={(v) => update({ showBleDiagnostics: v })} /></div><StatusRow label="Web Bluetooth API" ok={btOk ?? false} pending={btOk === null} /><StatusRow label="requestLEScan" ok={leOk} /><StatusRow label="watchAdvertisements" ok={advOk} /></div>
        </SettingsSection>

        <SettingsSection value="about" title="Informacje o aplikacji" icon={<Info className="h-4 w-4" />}>
          <div className="space-y-2 text-sm"><div className="flex justify-between gap-3"><span>Wersja</span><code className="text-xs">{APP_VERSION}</code></div><div className="flex justify-between gap-3"><span>Motyw</span><span>{s.theme}</span></div><div className="flex items-center justify-between"><Label>Porady po pierwszym uruchomieniu</Label><Switch checked={s.showFirstRunTips ?? true} onCheckedChange={(v) => update({ showFirstRunTips: v })} /></div></div>
        </SettingsSection>
      </Accordion>
    </div>
  );
}

function SettingsSection({ value, title, icon, children }: { value: string; title: string; icon: ReactNode; children: ReactNode }) { return <Card><AccordionItem value={value} className="border-0"><AccordionTrigger className="px-5 py-4 hover:no-underline"><div className="flex items-center gap-2 font-display text-base font-black">{icon}{title}</div></AccordionTrigger><AccordionContent className="px-5 pb-5"><CardContent className="p-0">{children}</CardContent></AccordionContent></AccordionItem></Card>; }
function Row({ label, children }: { label: string; children: ReactNode }) { return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>; }
function GroupEditor({ group, onRename, onIcon, onDelete }: { group: SensorGroup; onRename: (id: string, name: string) => void; onIcon: (id: string, icon: SensorGroup["icon"]) => void; onDelete: () => void }) { const Icon = getGroupIcon(group); return <div className="grid gap-2 rounded-2xl border bg-card p-3 sm:grid-cols-[auto_1fr_170px_auto]"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><Input value={group.name} onChange={(e) => onRename(group.id, e.target.value)} /><Select value={group.icon ?? "other"} onValueChange={(v) => onIcon(group.id, v as SensorGroup["icon"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{GROUP_ICON_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button></div>; }
function StatusRow({ label, ok, pending }: { label: string; ok: boolean; pending?: boolean }) { return <div className="flex items-center justify-between text-sm"><span>{label}</span><Badge variant={pending ? "secondary" : ok ? "default" : "outline"}>{pending ? "sprawdzanie…" : ok ? "Dostępne" : "Ograniczone"}</Badge></div>; }
