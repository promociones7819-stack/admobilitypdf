import { Check, ChevronDown, FolderCheck, FolderOpen, HardDrive } from "lucide-react";
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

export function ProjectBar() {
  const { supported, projects, current, chooseFolder, selectProject } = useProjects();

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
        {projects.length > 0 && (
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
              {projects.map((project) => (
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
      </div>
    </div>
  );
}
