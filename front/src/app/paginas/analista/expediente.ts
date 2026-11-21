// Vista del analista de expansión. Gira alrededor de «¿qué impide avanzar?»: en vez de ocho
// alertas, una frase con su cita y las acciones para resolverla o turnarla.
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { causas, dato, documentoDeRegla, normalizar, queImpideAvanzar, siguienteAccion } from '../../core/analisis';
import { CuentasService } from '../../core/cuentas.service';
import { ExpedientesService } from '../../core/expedientes.service';
import { ETIQUETA_ESTADO, FlujoService } from '../../core/flujo.service';
import { ArchivoRecibido, DOC, Dato, Evidencia, Hallazgo, TIPOS_DOCUMENTO, Tarea, TipoDocumento } from '../../core/modelos';
import { causaDe, regla } from '../../core/reglas-catalogo';
import { Visibilidad } from '../../core/visibilidad';
import { CabeceraExpediente, CajonEvidencia } from '../../ui/expediente-ui';
import { pct } from '../../ui/ui';

type Accion = 'turnar' | 'pedir' | 'aclarar';
interface CampoFicha { etiqueta: string; valor: string | null; normalizado: string; evidencia: Evidencia[]; fuente: string; oculto: boolean; sustentado: boolean }

@Component({
  selector: 'app-expediente-analista',
  imports: [RouterLink, CabeceraExpediente, CajonEvidencia],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './expediente.html',
  styleUrl: './expediente.css',
})
export class ExpedienteAnalista {
  readonly id = input.required<string>();
  private readonly expedientes = inject(ExpedientesService);
  private readonly flujo = inject(FlujoService);
  private readonly cuentas = inject(CuentasService);
  protected readonly visible = inject(Visibilidad);
  protected readonly DOC = DOC;
  protected readonly pct = pct;
  protected readonly ETIQUETA_ESTADO = ETIQUETA_ESTADO;
  protected readonly regla = regla;
  protected readonly causaDe = causaDe;
  protected readonly DOC_DE = (h: Hallazgo) => documentoDeRegla(h.reglaId) ?? (this.d()?.faltantes[0] as TipoDocumento | undefined) ?? 'Uso de Suelo';
  protected readonly nombres = (a: ArchivoRecibido[]) => a.map((x) => x.nombre).join(', ');

  protected readonly exp = computed(() => this.expedientes.lista().find((e) => e.id === this.id()));
  protected readonly d = computed(() => this.exp()?.dictamen);
  protected readonly enProceso = computed(() => !!this.exp() && ExpedientesService.enProceso(this.exp()!));
  protected readonly bloqueo = computed(() => (this.exp() ? queImpideAvanzar(this.exp()!) : null));
  protected readonly tareas = computed(() => this.flujo.tareas().filter((t) => t.exp === this.id()));
  protected readonly siguiente = computed(() => this.exp()
    ? siguienteAccion(this.exp()!, this.flujo.tareas(), this.flujo.validaciones(), this.flujo.decisionDe(this.id())) : null);
  protected readonly causasTxt = computed(() => [...causas(this.d())].join(', '));

  /** Qué tipos detectó el sistema, cuáles faltan, cuáles requieren identificación y si hay duplicados. */
  protected readonly inventario = computed(() => {
    const e = this.exp();
    const d = this.d();
    if (!e) return [];
    return TIPOS_DOCUMENTO.map((tipo) => {
      const archivos = e.archivos.filter((a) => a.tipo === tipo && a.vigente);
      const anteriores = e.archivos.filter((a) => a.tipo === tipo && !a.vigente).length;
      const doc = d?.documentos.find((x) => x.tipo === tipo);
      const otroTipo = d?.validaciones.find((v) => v.reglaId === 'G1' && v.documento && d.documentos.find((x) => x.id === v.documento)?.tipo === tipo);
      let estado: 'detectado' | 'falta' | 'identificar' | 'ilegible' | 'recibido' = archivos.length ? 'recibido' : 'falta';
      if (doc) estado = doc.legible ? 'detectado' : 'ilegible';
      if (otroTipo) estado = 'identificar';
      return { tipo, archivos, anteriores, estado, doc, duplicado: archivos.length > 1 };
    });
  });

  /** Ficha con los datos clave, la escritura original y su versión normalizada. */
  protected readonly ficha = computed<CampoFicha[]>(() => {
    const d = this.d();
    if (!d) return [];
    const buscar = (nombres: string[], tipos: TipoDocumento[]): { x: Dato; tipo: string } | null => {
      for (const t of tipos) {
        const doc = d.documentos.find((y) => y.tipo === t);
        if (!doc) continue;
        for (const n of nombres) { const x = dato(d, doc.id, n); if (x?.valor) return { x, tipo: t }; }
      }
      return null;
    };
    const filas: [string, string[], TipoDocumento[]][] = [
      ['Calle y número', ['calle', 'direccion'], ['Escrituras', 'Predial', 'Alineamiento y Número Oficial', 'Uso de Suelo']],
      ['Número oficial', ['numero_oficial', 'numero_exterior'], ['Alineamiento y Número Oficial', 'Escrituras']],
      ['Colonia y municipio', ['colonia'], ['Escrituras', 'Predial']],
      ['Titular o propietario', ['titular', 'propietario'], ['Escrituras']],
      ['Contribuyente', ['contribuyente'], ['Predial']],
      ['Superficie del terreno (m²)', ['superficie_terreno_m2', 'superficie_m2'], ['Escrituras', 'Predial']],
      ['Clave catastral o cuenta predial', ['clave_catastral', 'cuenta_predial'], ['Predial', 'Escrituras']],
      ['Uso de suelo autorizado', ['uso_autorizado', 'giro_autorizado'], ['Uso de Suelo']],
      ['Compatibilidad con uso comercial', ['compatibilidad_comercial'], ['Uso de Suelo']],
    ];
    return filas.map(([etiqueta, nombres, tipos]) => {
      const r = buscar(nombres, tipos);
      let valor = r?.x.valor ?? null;
      if (r && etiqueta === 'Calle y número') {
        const doc = d.documentos.find((y) => y.tipo === r.tipo)!;
        const num = dato(d, doc.id, 'numero_exterior')?.valor;
        valor = num && r.x.nombre === 'calle' ? `${valor} ${num}` : valor;
      }
      if (r && etiqueta === 'Colonia y municipio') {
        const doc = d.documentos.find((y) => y.tipo === r.tipo)!;
        valor = [valor, dato(d, doc.id, 'municipio')?.valor].filter(Boolean).join(', ');
      }
      return { etiqueta, valor, normalizado: normalizar(valor), evidencia: r?.x.evidencia ?? [], fuente: r?.tipo ?? '',
        oculto: !!r && !this.visible.campo(r.x.campo), sustentado: r?.x.sustentado ?? true };
    });
  });

  // ---------------------------------------------------------------- acciones
  protected readonly accion = signal<{ tipo: Accion; hallazgo?: Hallazgo; documento?: TipoDocumento } | null>(null);
  protected readonly texto = signal('');
  protected readonly aviso = signal('');
  protected readonly citas = signal<Evidencia[]>([]);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  protected readonly puedeAnalizar = this.cuentas.puede('expedientes.analizar');

  constructor() {
    this.expedientes.refrescar();
    queueMicrotask(() => this.expedientes.sincronizar(this.id()));
    const reloj = setInterval(() => { if (this.enProceso()) this.expedientes.sincronizar(this.id()); }, 3000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  protected tareaDe(h: Hallazgo): Tarea | undefined {
    return this.tareas().filter((t) => t.hallazgo?.id === h.id).at(-1);
  }

  protected abrirAccion(tipo: Accion, hallazgo?: Hallazgo, documento?: TipoDocumento): void {
    const local = this.exp() ? ExpedientesService.titulo(this.exp()!) : 'el inmueble';
    const doc = documento ?? (hallazgo ? undefined : undefined);
    const textos: Record<Accion, string> = {
      turnar: hallazgo ? `Revisar «${hallazgo.titulo}». ${hallazgo.explicacion}` : '',
      pedir: `Para continuar con ${local} necesitamos ${doc ? DOC[doc].que.toLowerCase() : 'un documento'}` +
        (hallazgo ? ` que resuelva lo siguiente: ${hallazgo.titulo.toLowerCase()}.` : '.'),
      aclarar: hallazgo ? `Aclarar «${hallazgo.titulo}» ante la autoridad o el arrendador.` : '',
    };
    this.accion.set({ tipo, hallazgo, documento: doc });
    this.texto.set(textos[tipo]);
    this.aviso.set('');
  }

  protected confirmar(): void {
    const a = this.accion();
    if (!a) return;
    const h = a.hallazgo;
    const base = { exp: this.id(), hallazgo: h ? { id: h.id, titulo: h.titulo, reglaId: h.reglaId } : undefined,
      causa: h ? causaDe(h.reglaId) : 'Documentación', documento: a.documento };
    if (a.tipo === 'turnar') {
      this.flujo.crearTarea({ ...base, tipo: 'turnado', area: 'Jurídico', titulo: h?.titulo ?? 'Revisión jurídica', nota: this.texto() });
      this.aviso.set('Turnado a Jurídico. Ahora la siguiente acción es suya.');
    } else if (a.tipo === 'pedir') {
      this.flujo.crearTarea({ ...base, tipo: 'solicitud_documento', area: 'Arrendador', estado: 'solicitado',
        titulo: `Enviar ${a.documento?.toLowerCase() ?? 'documento'}`, solicitud: this.texto() });
      this.aviso.set('Solicitud enviada al arrendador. La verá en «Mis trámites».');
    } else {
      this.flujo.crearTarea({ ...base, tipo: 'aclaracion', area: 'Trámites', titulo: `Aclaración: ${h?.titulo ?? ''}`, nota: this.texto() });
      this.aviso.set('Aclaración enviada a Trámites.');
    }
    this.accion.set(null);
  }

  protected async analizar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.expedientes.iniciarAnalisis(this.id(), this.exp()?.corridas.length ? 'Reintento del análisis' : 'Primera revisión');
    } catch (e) {
      this.error.set(`No se pudo enviar a análisis: ${(e as Error).message}.`);
    } finally {
      this.ocupado.set(false);
    }
  }
}
