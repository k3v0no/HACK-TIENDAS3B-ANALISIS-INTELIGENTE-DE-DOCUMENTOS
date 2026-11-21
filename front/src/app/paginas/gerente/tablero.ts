// Tablero del gerente o comité de expansión: cuántos inmuebles hay en cada recomendación, cuántos
// esperan validación jurídica y cuántos tienen decisión. Los contadores filtran la lista.
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { causas, estadoValidacion, queImpideAvanzar, siguienteAccion } from '../../core/analisis';
import { ExpedientesService } from '../../core/expedientes.service';
import { FlujoService } from '../../core/flujo.service';
import { EstadoBandeja } from '../../core/modelos';
import { CAUSAS, Causa } from '../../core/reglas-catalogo';
import { Encabezado, Estado } from '../../ui/ui';

type Filtro = { tipo: string; valor?: string } | null;
const DECISION = { avanza: 'Avanza', espera: 'En espera', descartado: 'Descartado' } as const;

@Component({
  selector: 'app-tablero',
  imports: [Encabezado, Estado, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tablero.html',
  styleUrl: './tablero.css',
})
export class Tablero {
  private readonly expedientes = inject(ExpedientesService);
  private readonly flujo = inject(FlujoService);
  protected readonly causasLista: (Causa | 'Falta predial' | 'Falta uso de suelo')[] = [...CAUSAS, 'Falta predial', 'Falta uso de suelo'];
  protected readonly DECISION = DECISION;
  protected readonly filtro = signal<Filtro>(null);
  protected readonly motivo = signal<string | null>(null);

  protected readonly filas = computed(() => {
    const tareas = this.flujo.tareas(), vals = this.flujo.validaciones();
    return this.expedientes.lista().map((e) => {
      const decision = this.flujo.decisionDe(e.id);
      const motivos = new Set<string>(causas(e.dictamen));
      if (e.dictamen?.faltantes.includes('Predial')) motivos.add('Falta predial');
      if (e.dictamen?.faltantes.includes('Uso de Suelo')) motivos.add('Falta uso de suelo');
      return {
        e, titulo: ExpedientesService.titulo(e), estado: ExpedientesService.estado(e), decision,
        val: estadoValidacion(e, vals), sig: siguienteAccion(e, tareas, vals, decision), motivos,
        bloqueo: queImpideAvanzar(e).frase,
      };
    });
  });

  protected readonly kpi = computed(() => {
    const f = this.filas();
    const rec = (v: EstadoBandeja) => f.filter((x) => x.estado === v).length;
    return {
      total: f.length,
      cumple: rec('Cumple'), revisar: rec('Requiere revisión'), noCumple: rec('No cumple'),
      sinDictamen: rec('Sin analizar') + rec('Analizando'),
      esperanJuridico: f.filter((x) => x.e.dictamen && x.estado !== 'Cumple' && x.val.estado !== 'validado' && !x.decision).length,
      avanza: f.filter((x) => x.decision?.valor === 'avanza').length,
      espera: f.filter((x) => x.decision?.valor === 'espera').length,
      descartado: f.filter((x) => x.decision?.valor === 'descartado').length,
    };
  });

  protected readonly visibles = computed(() => {
    const fl = this.filtro(), m = this.motivo();
    return this.filas().filter((x) => {
      if (m && !x.motivos.has(m)) return false;
      if (!fl) return true;
      if (fl.tipo === 'rec') return fl.valor === 'Sin analizar' ? (x.estado === 'Sin analizar' || x.estado === 'Analizando') : x.estado === (fl.valor as EstadoBandeja);
      if (fl.tipo === 'val') return x.e.dictamen && x.estado !== 'Cumple' && x.val.estado !== 'validado' && !x.decision;
      return x.decision?.valor === fl.valor;
    });
  });

  constructor() {
    this.expedientes.refrescar();
    this.expedientes.sincronizarEnProceso();
    const reloj = setInterval(() => this.expedientes.sincronizarEnProceso(), 6000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  protected activo(f: Filtro): boolean {
    return JSON.stringify(f) === JSON.stringify(this.filtro());
  }

  protected alternar(f: Filtro): void {
    this.filtro.set(this.activo(f) ? null : f);
  }

  protected pctDe(n: number): number {
    return this.kpi().total ? (n / this.kpi().total) * 100 : 0;
  }
}
