import {
  Check,
  ChevronDown,
  FolderCheck,
  FolderOpen,
  HardDrive,
  History,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjects } from "@/lib/projects/store";
import { usePdfEditor } from "@/lib/pdf/store";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProjectVersionInfo } from "@/lib/projects/storage";

export function ProjectBar() {
  const {
    supported,
    projects,
    current,
    chooseFolder,
    selectProject,
    renameCurrent,
    archiveCurrent,
  } = useProjects();
  const { hasDocument, createProjectVersion, getProjectVersions, restoreProjectVersion } =
    usePdfEditor();
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<ProjectVersionInfo[]>([]);
  const [versionLabel, setVersionLabel] = useState("");
  const [projectName, setProjectName] = useState("");

  async function refreshVersions() {
    setVersions(await getProjectVersions());
  }

  async function pick() {
    if (!supported) {
      toast.error("Para guardar en carpetas usa Chrome o Edge y abre la app desde localhost.");
      return;
    }
    try {
      await chooseFolder();
      toast.success("Carpeta del proyecto vinculada");
    } catch (error) {
      if ((error as { name?: string })?.name !== "AbortError")
        toast.error("No se ha podido vincular la carpeta.");
    }
  }

  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-slate-950 px-3 text-white">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <HardDrive className="size-4 text-sky-300" />
        <span className="hidden text-slate-400 sm:inline">Proyecto local</span>
        <span className="truncate font-semibold">{current?.name ?? "Sin carpeta asignada"}</span>
      </div>
      <div className="flex items-center gap-2">
        {projects.some((project) => !project.archived) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-white hover:bg-white/10 hover:text-white"
              >
                Proyectos <ChevronDown className="ml-2 size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Carpetas recientes</DropdownMenuLabel>
              {projects
                .filter((project) => !project.archived)
                .map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onSelect={() => {
                      void selectProject(project).then((ok) =>
                        ok
                          ? toast.success(`Proyecto «${project.name}» activado`)
                          : toast.error("Permiso de carpeta denegado"),
                      );
                    }}
                  >
                    <FolderOpen className="mr-2 size-4" />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {current?.id === project.id && <Check className="size-4 text-emerald-600" />}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void pick()}>
                <FolderCheck className="mr-2 size-4" /> Asignar otra carpeta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          size="sm"
          className="h-8 bg-sky-500 text-white hover:bg-sky-400"
          onClick={() => void pick()}
        >
          <FolderOpen className="mr-2 size-4" />
          {current ? "Cambiar carpeta" : "Asignar carpeta"}
        </Button>
        {current && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-white hover:bg-white/10 hover:text-white"
            onClick={() => {
              setProjectName(current.name);
              setVersionsOpen(true);
              void refreshVersions();
            }}
          >
            <History className="mr-2 size-4" /> Versiones
          </Button>
        )}
      </div>
      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Versiones del proyecto</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl border p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Proyecto</p>
            <div className="flex gap-2">
              <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
              <Button
                variant="outline"
                onClick={() =>
                  void renameCurrent(projectName).then(() => toast.success("Proyecto renombrado"))
                }
              >
                Renombrar
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (
                    !window.confirm(
                      "¿Archivar este proyecto de la lista reciente? La carpeta no se borrará.",
                    )
                  )
                    return;
                  void archiveCurrent().then(() => {
                    setVersionsOpen(false);
                    toast.success("Proyecto archivado sin borrar sus archivos");
                  });
                }}
              >
                Archivar
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              value={versionLabel}
              onChange={(event) => setVersionLabel(event.target.value)}
              placeholder="Ej. Revisión aprobada"
            />
            <Button
              disabled={!hasDocument}
              onClick={() => {
                void createProjectVersion(versionLabel)
                  .then(() => {
                    setVersionLabel("");
                    void refreshVersions();
                    toast.success("Versión guardada");
                  })
                  .catch(() => toast.error("No se ha podido guardar la versión"));
              }}
            >
              <Plus className="mr-2 size-4" />
              Guardar versión
            </Button>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {versions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Todavía no hay versiones manuales.
              </p>
            ) : (
              versions.map((version) => (
                <button
                  key={version.file}
                  className="flex w-full items-center justify-between rounded-xl border p-3 text-left hover:bg-accent"
                  onClick={() => {
                    if (!window.confirm(`¿Recuperar «${version.label}»?`)) return;
                    void restoreProjectVersion(version.file)
                      .then(() => {
                        setVersionsOpen(false);
                        toast.success("Versión recuperada");
                      })
                      .catch(() => toast.error("No se ha podido recuperar"));
                  }}
                >
                  <span>
                    <strong className="block">{version.label}</strong>
                    <span className="text-xs text-muted-foreground">{version.documentName}</span>
                  </span>
                  <time className="text-xs text-muted-foreground">
                    {new Date(version.updatedAt).toLocaleString()}
                  </time>
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVersionsOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
