import { useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Braces,
  FileCheck2,
  FileDiff,
  Files,
  Loader2,
  ShieldCheck,
  LockKeyhole,
  PenTool,
  Stamp,
  QrCode,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { saveBlob } from "@/lib/download";
import { optimizePdf } from "@/lib/pdf/optimize";
import {
  addQrCodeToPdf,
  comparePdfText,
  comparePdfVisual,
  decoratePdf,
  inspectPdf,
  type ComparisonPage,
  type VisualComparisonPage,
} from "@/lib/pdf/pro";
import { cleanPdfMetadata, signPdfWithP12 } from "@/lib/pdf/security";
import { QuestionnaireBuilder } from "./QuestionnaireBuilder";

type CreatedHandler = (file: File) => Promise<void> | void;

function FilePicker({
  file,
  onFile,
  label = "Elegir PDF",
}: {
  file: File | null;
  onFile: (file: File) => void;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-4">
      <Button variant="outline" onClick={() => ref.current?.click()}>
        <Upload className="mr-2 size-4" /> {label}
      </Button>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {file?.name ?? "Ningún archivo seleccionado"}
      </span>
      <input
        ref={ref}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (selected) onFile(selected);
        }}
      />
    </div>
  );
}

async function outputFile(
  bytes: Uint8Array,
  name: string,
  onPdfCreated?: CreatedHandler,
): Promise<void> {
  const file = new File([bytes.slice(0) as unknown as BlobPart], name, {
    type: "application/pdf",
  });
  if (onPdfCreated) await onPdfCreated(file);
  else await saveBlob(file, name);
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function ProfessionalToolsWorkspace({ onPdfCreated }: { onPdfCreated?: CreatedHandler }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [brandFile, setBrandFile] = useState<File | null>(null);
  const [watermark, setWatermark] = useState("");
  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");
  const [numbering, setNumbering] = useState(true);
  const [batesPrefix, setBatesPrefix] = useState("");
  const [clean, setClean] = useState(true);
  const [left, setLeft] = useState<File | null>(null);
  const [right, setRight] = useState<File | null>(null);
  const [comparison, setComparison] = useState<ComparisonPage[]>([]);
  const [visualComparison, setVisualComparison] = useState<VisualComparisonPage[]>([]);
  const [auditFile, setAuditFile] = useState<File | null>(null);
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof inspectPdf>> | null>(null);
  const batchRef = useRef<HTMLInputElement>(null);
  const [batchLevel, setBatchLevel] = useState<"quality" | "balanced" | "max">("balanced");
  const [batchWatermark, setBatchWatermark] = useState("");
  const [protectFile, setProtectFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(false);
  const [allowModifying, setAllowModifying] = useState(false);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrValue, setQrValue] = useState("");
  const [qrAllPages, setQrAllPages] = useState(false);
  const [signFile, setSignFile] = useState<File | null>(null);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [certificatePassword, setCertificatePassword] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signReason, setSignReason] = useState("Aprobación del documento");
  const certificateRef = useRef<HTMLInputElement>(null);

  const changedPages = useMemo(
    () => comparison.filter((item) => item.similarity < 100),
    [comparison],
  );

  async function runBranding() {
    if (!brandFile) {
      toast.error("Selecciona un PDF.");
      return;
    }
    setBusy(true);
    try {
      const bytes = await decoratePdf(new Uint8Array(await brandFile.arrayBuffer()), {
        watermark,
        watermarkOpacity: 0.16,
        watermarkRotation: 35,
        header,
        footer,
        pageNumbers: numbering,
        batesPrefix,
        cleanMetadata: clean,
      });
      await outputFile(bytes, brandFile.name.replace(/\.pdf$/i, "-preparado.pdf"), onPdfCreated);
      toast.success("PDF preparado y abierto en el editor");
    } catch (error) {
      console.error(error);
      toast.error("No se ha podido preparar el PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function compare() {
    if (!left || !right) {
      toast.error("Selecciona los dos PDF.");
      return;
    }
    setBusy(true);
    try {
      const leftBytes = new Uint8Array(await left.arrayBuffer());
      const rightBytes = new Uint8Array(await right.arrayBuffer());
      const [textResult, visualResult] = await Promise.all([
        comparePdfText(leftBytes, rightBytes),
        comparePdfVisual(leftBytes, rightBytes),
      ]);
      setComparison(textResult);
      setVisualComparison(visualResult);
      toast.success("Comparación terminada");
    } catch (error) {
      console.error(error);
      toast.error("No se han podido comparar los documentos.");
    } finally {
      setBusy(false);
    }
  }

  async function runBatch(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setProgress(0);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]!;
        const original = new Uint8Array(await file.arrayBuffer());
        const cleaned = await cleanPdfMetadata(original);
        const prepared = batchWatermark
          ? await decoratePdf(cleaned, { watermark: batchWatermark, watermarkOpacity: 0.15 })
          : cleaned;
        const result = await optimizePdf(prepared, { level: batchLevel });
        zip.file(file.name.replace(/\.pdf$/i, "-optimizado.pdf"), result.bytes);
        setProgress(Math.round(((index + 1) / files.length) * 100));
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      await saveBlob(blob, "pdfs-procesados.zip");
      toast.success(`${files.length} PDF procesados`);
    } catch (error) {
      console.error(error);
      toast.error("El lote no se ha podido completar.");
    } finally {
      setBusy(false);
    }
  }

  async function inspect() {
    if (!auditFile) return;
    setBusy(true);
    try {
      setAudit(await inspectPdf(new Uint8Array(await auditFile.arrayBuffer())));
    } catch (error) {
      console.error(error);
      toast.error("No se ha podido inspeccionar el PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function protectPdf() {
    if (!protectFile || !password) {
      toast.error("Selecciona un PDF y escribe una contraseña.");
      return;
    }
    setBusy(true);
    try {
      const { encryptPDF } = await import("@pdfsmaller/pdf-encrypt");
      const encrypted = await encryptPDF(
        new Uint8Array(await protectFile.arrayBuffer()),
        password,
        {
          ownerPassword: ownerPassword || password,
          algorithm: "AES-256",
          allowPrinting,
          allowHighQualityPrint: allowPrinting,
          allowCopying,
          allowExtraction: allowCopying,
          allowModifying,
          allowAnnotating: allowModifying,
          allowFillingForms: true,
          allowAssembly: false,
        },
      );
      await saveBlob(
        new Blob([encrypted.slice(0) as unknown as BlobPart], { type: "application/pdf" }),
        protectFile.name.replace(/\.pdf$/i, "-protegido.pdf"),
      );
      toast.success("PDF protegido con cifrado AES-256");
    } catch (error) {
      console.error(error);
      toast.error("No se ha podido cifrar el PDF. Comprueba que no estuviera ya protegido.");
    } finally {
      setBusy(false);
    }
  }

  async function createQrPdf() {
    if (!qrFile || !qrValue.trim()) {
      toast.error("Selecciona un PDF y escribe el contenido del QR.");
      return;
    }
    setBusy(true);
    try {
      const bytes = await addQrCodeToPdf(
        new Uint8Array(await qrFile.arrayBuffer()),
        qrValue.trim(),
        { allPages: qrAllPages },
      );
      await outputFile(bytes, qrFile.name.replace(/\.pdf$/i, "-qr.pdf"), onPdfCreated);
      toast.success("Código QR añadido");
    } catch (error) {
      console.error(error);
      toast.error("No se ha podido crear el QR.");
    } finally {
      setBusy(false);
    }
  }

  async function signPdf() {
    if (!signFile || !certificate) {
      toast.error("Selecciona el PDF y el certificado P12/PFX.");
      return;
    }
    setBusy(true);
    try {
      const bytes = await signPdfWithP12({
        pdf: new Uint8Array(await signFile.arrayBuffer()),
        certificate: new Uint8Array(await certificate.arrayBuffer()),
        passphrase: certificatePassword,
        name: signerName,
        reason: signReason,
      });
      await saveBlob(
        new Blob([bytes.slice(0) as unknown as BlobPart], { type: "application/pdf" }),
        signFile.name.replace(/\.pdf$/i, "-firmado.pdf"),
      );
      toast.success("PDF firmado digitalmente con el certificado");
    } catch (error) {
      console.error(error);
      toast.error("No se ha podido firmar. Comprueba el certificado y su contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="h-full overflow-y-auto bg-muted/20 px-4 py-6 sm:px-7">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Herramientas profesionales</h1>
          <p className="mt-2 text-muted-foreground">
            Formularios, comparación, limpieza, marcas y trabajo por lotes sin subir documentos.
          </p>
        </div>
        <Tabs defaultValue="prepare">
          <TabsList className="mb-5 h-auto flex-wrap justify-start">
            <TabsTrigger value="prepare">
              <Stamp className="mr-2 size-4" />
              Preparar
            </TabsTrigger>
            <TabsTrigger value="forms">
              <Braces className="mr-2 size-4" />
              Formularios
            </TabsTrigger>
            <TabsTrigger value="compare">
              <FileDiff className="mr-2 size-4" />
              Comparar
            </TabsTrigger>
            <TabsTrigger value="batch">
              <Files className="mr-2 size-4" />
              Lotes
            </TabsTrigger>
            <TabsTrigger value="protect">
              <LockKeyhole className="mr-2 size-4" />
              Proteger
            </TabsTrigger>
            <TabsTrigger value="qr">
              <QrCode className="mr-2 size-4" />
              QR
            </TabsTrigger>
            <TabsTrigger value="sign">
              <PenTool className="mr-2 size-4" />
              Firma digital
            </TabsTrigger>
            <TabsTrigger value="audit">
              <ShieldCheck className="mr-2 size-4" />
              Auditar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="prepare">
            <Panel
              title="Marca, numeración y privacidad"
              description="Añade identidad visual, numera páginas y elimina metadatos personales."
            >
              <FilePicker file={brandFile} onFile={setBrandFile} />
              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <Label>Marca de agua</Label>
                  <Input
                    value={watermark}
                    onChange={(e) => setWatermark(e.target.value)}
                    placeholder="BORRADOR"
                  />
                </div>
                <div>
                  <Label>Encabezado</Label>
                  <Input
                    value={header}
                    onChange={(e) => setHeader(e.target.value)}
                    placeholder="Título o empresa"
                  />
                </div>
                <div>
                  <Label>Pie de página</Label>
                  <Input
                    value={footer}
                    onChange={(e) => setFooter(e.target.value)}
                    placeholder="Texto legal"
                  />
                </div>
                <div>
                  <Label>Prefijo Bates</Label>
                  <Input
                    value={batesPrefix}
                    onChange={(e) => setBatesPrefix(e.target.value)}
                    placeholder="EXP-"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={numbering} onCheckedChange={(v) => setNumbering(v === true)} />
                  Numerar páginas
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={clean} onCheckedChange={(v) => setClean(v === true)} />
                  Eliminar metadatos
                </label>
              </div>
              <Button onClick={() => void runBranding()} disabled={busy || !brandFile}>
                {busy ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <FileCheck2 className="mr-2 size-4" />
                )}
                Crear PDF
              </Button>
            </Panel>
          </TabsContent>

          <TabsContent value="forms">
            <QuestionnaireBuilder onPdfCreated={onPdfCreated} />
          </TabsContent>

          <TabsContent value="compare">
            <Panel
              title="Comparar versiones"
              description="Localiza por página el texto añadido y eliminado entre dos documentos."
            >
              <div className="grid gap-3 md:grid-cols-2">
                <FilePicker file={left} onFile={setLeft} label="PDF anterior" />
                <FilePicker file={right} onFile={setRight} label="PDF nuevo" />
              </div>
              <Button onClick={() => void compare()} disabled={busy || !left || !right}>
                Comparar documentos
              </Button>
              {comparison.length > 0 && (
                <div className="space-y-3">
                  <p className="font-semibold">{changedPages.length} página(s) con diferencias</p>
                  {comparison.map((item) => {
                    const visual = visualComparison.find((entry) => entry.page === item.page);
                    return (
                      <article
                        key={item.page}
                        className="grid gap-4 rounded-xl border p-4 md:grid-cols-[220px_1fr]"
                      >
                        {visual && (
                          <div>
                            <img
                              src={visual.image}
                              alt={`Diferencias visuales página ${item.page}`}
                              className="max-h-72 w-full rounded border bg-white object-contain"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                              Cambio visual: {visual.changedPercent}%
                            </p>
                          </div>
                        )}
                        <div>
                          <div className="flex items-center justify-between">
                            <strong>Página {item.page}</strong>
                            <span className="text-sm">Similitud {item.similarity}%</span>
                          </div>
                          {item.added.length > 0 && (
                            <p className="mt-2 text-sm text-emerald-700">
                              Añadido: {item.added.join(", ")}
                            </p>
                          )}
                          {item.removed.length > 0 && (
                            <p className="mt-1 text-sm text-red-700">
                              Eliminado: {item.removed.join(", ")}
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="batch">
            <Panel
              title="Procesamiento por lotes"
              description="Limpia metadatos y optimiza muchos PDF en una sola operación."
            >
              <Button variant="outline" onClick={() => batchRef.current?.click()} disabled={busy}>
                <Files className="mr-2 size-4" />
                Seleccionar varios PDF
              </Button>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Calidad</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={batchLevel}
                    onChange={(event) => setBatchLevel(event.target.value as typeof batchLevel)}
                  >
                    <option value="quality">Alta</option>
                    <option value="balanced">Equilibrada</option>
                    <option value="max">Máxima reducción</option>
                  </select>
                </div>
                <div>
                  <Label>Marca opcional</Label>
                  <Input
                    value={batchWatermark}
                    onChange={(event) => setBatchWatermark(event.target.value)}
                    placeholder="CONFIDENCIAL"
                  />
                </div>
              </div>
              <input
                ref={batchRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  void runBatch(files);
                }}
              />
              {busy && <Progress value={progress} />}
              <p className="text-sm text-muted-foreground">
                El resultado se guarda en un ZIP; los originales no se modifican.
              </p>
            </Panel>
          </TabsContent>

          <TabsContent value="audit">
            <Panel
              title="Inspección del documento"
              description="Revisa estructura, formularios y metadatos antes de publicar o archivar."
            >
              <FilePicker
                file={auditFile}
                onFile={(file) => {
                  setAuditFile(file);
                  setAudit(null);
                }}
              />
              <Button onClick={() => void inspect()} disabled={busy || !auditFile}>
                <BadgeCheck className="mr-2 size-4" />
                Analizar
              </Button>
              {audit && (
                <dl className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
                  {Object.entries({
                    Páginas: audit.pages,
                    "Campos de formulario": audit.formFields,
                    "Accesibilidad estimada": `${audit.accessibilityScore}%`,
                    "PDF etiquetado": audit.tagged ? "Sí" : "No",
                    "Idioma del documento": audit.language || "Sin definir",
                    "Metadatos XMP": audit.hasXmp ? "Sí" : "No",
                    "Declaración PDF/A": audit.pdfAClaim
                      ? `PDF/A-${audit.pdfAClaim}`
                      : "No detectada",
                    Título: audit.title || "Sin definir",
                    Autor: audit.author || "Sin definir",
                    Creador: audit.creator || "Sin definir",
                    Productor: audit.producer || "Sin definir",
                  }).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-xs text-muted-foreground">{key}</dt>
                      <dd className="font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="protect">
            <Panel
              title="Protección AES-256"
              description="Cifra el contenido y configura permisos de impresión, copia y modificación."
            >
              <FilePicker file={protectFile} onFile={setProtectFile} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Contraseña para abrir</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <Label>Contraseña de administración</Label>
                  <Input
                    type="password"
                    value={ownerPassword}
                    onChange={(event) => setOwnerPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={allowPrinting}
                    onCheckedChange={(value) => setAllowPrinting(value === true)}
                  />
                  Permitir imprimir
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={allowCopying}
                    onCheckedChange={(value) => setAllowCopying(value === true)}
                  />
                  Permitir copiar
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={allowModifying}
                    onCheckedChange={(value) => setAllowModifying(value === true)}
                  />
                  Permitir modificar
                </label>
              </div>
              <Button
                onClick={() => void protectPdf()}
                disabled={busy || !protectFile || !password}
              >
                <LockKeyhole className="mr-2 size-4" />
                Proteger y guardar
              </Button>
              <p className="text-xs text-muted-foreground">
                El cifrado se realiza en este dispositivo. Guarda la contraseña: la aplicación no
                puede recuperarla.
              </p>
            </Panel>
          </TabsContent>
          <TabsContent value="qr">
            <Panel
              title="Código QR"
              description="Añade un QR real con una web, teléfono, correo o texto a una o todas las páginas."
            >
              <FilePicker file={qrFile} onFile={setQrFile} />
              <div>
                <Label>Contenido del QR</Label>
                <Input
                  value={qrValue}
                  onChange={(event) => setQrValue(event.target.value)}
                  placeholder="https://ad-mobility.es"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={qrAllPages}
                  onCheckedChange={(value) => setQrAllPages(value === true)}
                />
                Añadir en todas las páginas
              </label>
              <Button
                disabled={busy || !qrFile || !qrValue.trim()}
                onClick={() => void createQrPdf()}
              >
                <QrCode className="mr-2 size-4" />
                Añadir QR
              </Button>
            </Panel>
          </TabsContent>
          <TabsContent value="sign">
            <Panel
              title="Firma digital con certificado"
              description="Firma criptográficamente el PDF con un certificado P12/PFX local y formato CAdES separado."
            >
              <FilePicker file={signFile} onFile={setSignFile} />
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-4">
                <Button variant="outline" onClick={() => certificateRef.current?.click()}>
                  <PenTool className="mr-2 size-4" />
                  Elegir certificado
                </Button>
                <span className="truncate text-sm text-muted-foreground">
                  {certificate?.name ?? "Ningún certificado seleccionado"}
                </span>
                <input
                  ref={certificateRef}
                  type="file"
                  accept=".p12,.pfx,application/x-pkcs12"
                  className="hidden"
                  onChange={(event) => {
                    setCertificate(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Nombre del firmante</Label>
                  <Input
                    value={signerName}
                    onChange={(event) => setSignerName(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Contraseña del certificado</Label>
                  <Input
                    type="password"
                    value={certificatePassword}
                    onChange={(event) => setCertificatePassword(event.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
              <div>
                <Label>Motivo</Label>
                <Input value={signReason} onChange={(event) => setSignReason(event.target.value)} />
              </div>
              <Button disabled={busy || !signFile || !certificate} onClick={() => void signPdf()}>
                <PenTool className="mr-2 size-4" />
                Firmar y guardar
              </Button>
              <p className="text-xs text-muted-foreground">
                El certificado y su contraseña permanecen en memoria durante la operación y no se
                guardan en el proyecto.
              </p>
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
