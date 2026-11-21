// Trabajadores por tipo de usuario (pestañas fluidas), con filtro por nombre. «Modificar» abre un diálogo para
// cambiar nombre y área, y desde ahí activar o desactivar la cuenta.
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AREAS, Cuenta, CuentasService, PERFIL_INFO } from '../../core/cuentas.service';
import { FluidTabs, PestanaFluida } from '../../ui/fluid-tabs';
import { Encabezado } from '../../ui/ui';

const ORDEN_SECCIONES = ['Superusuario', ...AREAS];
const CORTO: Record<string, string> = { 'Analista de expansión': 'Analista', 'Gestor de trámites': 'Gestor' };

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); // quita acentos
}

@Component({
  selector: 'app-trabajadores',
  imports: [Encabezado, RouterLink, FormsModule, FluidTabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trabajadores.html',
  styleUrl: './trabajadores.css',
})
export class Trabajadores {
  private readonly cuentas = inject(CuentasService);
  protected readonly PERFIL_INFO = PERFIL_INFO;
  protected readonly areas = AREAS;
  protected readonly yo = () => this.cuentas.cuenta()?.usuario;

  protected readonly lista = signal<Cuenta[]>([]);
  protected readonly filtro = signal('');
  protected readonly activos = computed(() => this.lista().filter((t) => t.activo).length);

  protected readonly seccion = signal('todos');

  /** Trabajadores que pasan el filtro por nombre, en el orden de las áreas y luego por nombre. */
  private readonly filtrados = computed(() => {
    const q = normalizar(this.filtro().trim());
    return this.lista()
      .filter((t) => !q || normalizar(t.nombre).includes(q) || normalizar(t.usuario).includes(q))
      .sort((a, b) => ORDEN_SECCIONES.indexOf(a.perfil) - ORDEN_SECCIONES.indexOf(b.perfil) || a.nombre.localeCompare(b.nombre, 'es'));
  });

  /** «Todos» y una pestaña por tipo de usuario. La cuenta se muestra en la pestaña activa y, mientras
   *  hay filtro, en todas (es cuando sirve comparar); así las ocho pestañas caben en una pantalla normal. */
  protected readonly pestanas = computed<PestanaFluida[]>(() => {
    const conFiltro = !!this.filtro().trim();
    const cuenta = (id: string, n: number) => (conFiltro || this.seccion() === id ? n : undefined);
    return [
      { id: 'todos', etiqueta: 'Todos', icono: 'groups', cuenta: cuenta('todos', this.filtrados().length) },
      ...ORDEN_SECCIONES.map((p) => ({
        id: p, etiqueta: p, corto: CORTO[p], icono: PERFIL_INFO[p].icono,
        cuenta: cuenta(p, this.filtrados().filter((t) => t.perfil === p).length),
      })),
    ];
  });

  protected readonly visibles = computed(() =>
    this.seccion() === 'todos' ? this.filtrados() : this.filtrados().filter((t) => t.perfil === this.seccion()));
  protected readonly resultados = computed(() => this.visibles().length);

  // ---------------------------------------------------------------- diálogo «Modificar»
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly editando = signal<Cuenta | null>(null);
  protected readonly error = signal('');
  protected readonly aviso = signal('');
  protected nombre = '';
  protected area = AREAS[0];

  constructor() {
    this.recargar();
  }

  private async recargar(): Promise<void> {
    this.lista.set(await this.cuentas.trabajadores());
  }

  protected modificar(t: Cuenta): void {
    this.editando.set(t);
    this.nombre = t.nombre;
    this.area = t.perfil;
    this.error.set('');
    this.dialogo().nativeElement.showModal();
  }

  protected cerrar(): void {
    this.dialogo().nativeElement.close();
  }

  protected alCerrar(): void {
    this.editando.set(null);
  }

  protected guardar(): void {
    const t = this.editando();
    if (!t) return;
    try {
      const c = this.cuentas.actualizarTrabajador(t.usuario, { nombre: this.nombre, perfil: this.area });
      this.aviso.set(`Se guardaron los cambios de ${c.nombre}.`);
      this.cerrar();
      this.recargar();
    } catch (e) {
      this.error.set(`No se pudo guardar: ${(e as Error).message}.`);
    }
  }

  protected cambiarAcceso(activo: boolean): void {
    const t = this.editando();
    if (!t) return;
    this.cuentas.cambiarEstado(t.usuario, activo);
    this.aviso.set(activo ? `Se activó la cuenta de ${t.nombre}.` : `Se desactivó la cuenta de ${t.nombre}; ya no puede ingresar.`);
    this.cerrar();
    this.recargar();
  }
}
