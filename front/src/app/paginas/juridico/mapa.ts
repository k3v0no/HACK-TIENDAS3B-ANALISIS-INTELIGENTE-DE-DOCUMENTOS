// Mapa de inmuebles para Jurídico: un punto por expediente, con el estado del trámite al pasar
// el cursor. La ubicación es aproximada: el centro del municipio que aparece en los documentos
// (no se consulta ningún servicio de geocodificación, así que las direcciones no salen de aquí).
// Solo las teselas del mapa base se piden a OpenStreetMap.
import {
  AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { estadoValidacion } from '../../core/analisis';
import { ExpedientesService } from '../../core/expedientes.service';
import { FlujoService } from '../../core/flujo.service';
import { EstadoBandeja, Expediente } from '../../core/modelos';
import { Encabezado, Estado, fecha } from '../../ui/ui';

/** Centro aproximado de cada municipio (latitud, longitud). Los de documentos sintéticos son inventados. */
const MUNICIPIOS: Record<string, [number, number]> = {
  tultepec: [19.685, -99.128],
  'tepeji del rio de ocampo': [19.904, -99.341],
  'tepeji del rio': [19.904, -99.341],
  tepotzotlan: [19.716, -99.223],
  'melchor ocampo': [19.708, -99.144],
  tlahuelilpan: [20.129, -99.228],
  'tezontepec de aldama': [20.192, -99.273],
  ixmiquilpan: [20.482, -99.218],
  'villa del carbon': [19.727, -99.462],
  'mixquiahuala de juarez': [20.231, -99.213],
  mixquiahuala: [20.231, -99.213],
  'atotonilco de tula': [20.005, -99.218],
  temascalcingo: [19.915, -100.004],
  'cuautitlan izcalli': [19.647, -99.215],
  // sintéticos (municipios que no existen: se colocan en una zona verosímil de su estado)
  'san mateo tlalpizco': [19.36, -99.62],
  'santa cruz atempa': [20.09, -98.82],
  'villa del sol ixtapan': [19.47, -99.27],
  'san jeronimo atlaco': [19.80, -99.05],
  'ocotlan de las torres': [19.58, -98.98],
  'huehuetlan del monte': [19.52, -98.86],
  'santa ines tlalcoyunca': [20.03, -98.75],
};

const COLOR: Record<EstadoBandeja, string> = {
  Cumple: '#2E7D32', 'Requiere revisión': '#B26A00', 'No cumple': '#C62838', Analizando: '#5B6B6A', 'Sin analizar': '#5B6B6A',
};

interface Punto {
  exp: Expediente;
  titulo: string;
  estado: EstadoBandeja;
  municipio: string;
  coords: [number, number] | null;
  hallazgos: number;
  validacion: string;
  pendientes: number;
}

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Desplazamiento pequeño y estable por expediente, para que dos puntos del mismo municipio no se tapen. */
function desplazar(id: string, [lat, lon]: [number, number]): [number, number] {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return [lat + (((h % 1000) / 1000) - 0.5) * 0.03, lon + ((((h >> 10) % 1000) / 1000) - 0.5) * 0.03];
}

@Component({
  selector: 'app-mapa-juridico',
  imports: [Encabezado, Estado, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-encabezado icono="map" titulo="Mapa de inmuebles"
      descripcion="Dónde está cada expediente y en qué va. Pasa el cursor por un punto para ver el estado del trámite." />

    <section class="tarjeta mapa-tarjeta" aria-label="Mapa de inmuebles">
      <div #lienzo class="lienzo" role="application" aria-label="Mapa interactivo de los inmuebles"></div>
      <div class="leyenda" aria-label="Leyenda">
        <span><i [style.background]="COLOR['Cumple']"></i>Cumple</span>
        <span><i [style.background]="COLOR['Requiere revisión']"></i>Requiere revisión</span>
        <span><i [style.background]="COLOR['No cumple']"></i>No cumple</span>
        <span><i [style.background]="COLOR['Sin analizar']"></i>Sin dictamen</span>
        <span class="suave">Ubicación aproximada: centro del municipio.</span>
      </div>
    </section>

    <section class="tarjeta" aria-labelledby="lista-t">
      <h2 id="lista-t" class="titulo-lista">Inmuebles en el mapa ({{ ubicados().length }})</h2>
      <ul class="lista">
        @for (p of ubicados(); track p.exp.id) {
          <li (mouseenter)="resaltar(p.exp.id)" (mouseleave)="resaltar(null)">
            <i class="punto" [style.background]="COLOR[p.estado]"></i>
            <span class="texto"><a [routerLink]="['/juridico/expediente', p.exp.id]"><b>{{ p.titulo }}</b></a>
              <small class="suave">{{ p.municipio }} · {{ p.hallazgos }} hallazgo{{ p.hallazgos === 1 ? '' : 's' }} · {{ p.validacion }}
                @if (p.pendientes) { · {{ p.pendientes }} pendiente{{ p.pendientes === 1 ? '' : 's' }} }</small></span>
            <app-estado [valor]="p.estado" />
          </li>
        } @empty { <li class="suave">Todavía no hay expedientes con municipio identificado.</li> }
      </ul>
      @if (sinUbicar().length) {
        <p class="suave pequeno">Sin ubicación ({{ sinUbicar().length }}): el municipio no se identificó o no está en el catálogo.
          @for (p of sinUbicar(); track p.exp.id) { <a [routerLink]="['/juridico/expediente', p.exp.id]">{{ p.titulo }}</a>@if (!$last) {, } }</p>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .mapa-tarjeta { padding: .6rem; }
    .lienzo { height: min(62vh, 34rem); min-height: 20rem; border-radius: var(--radio-s); overflow: hidden; background: #E8EEF0; }
    .leyenda { display: flex; flex-wrap: wrap; gap: .4rem 1.1rem; padding: .7rem .5rem .2rem; font-size: .88rem; align-items: center; }
    .leyenda span { display: inline-flex; align-items: center; gap: .4rem; }
    .leyenda i, .punto { width: .8rem; height: .8rem; border-radius: 50%; display: inline-block; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.25); flex: none; }
    .titulo-lista { font-size: 1.05rem; margin-bottom: .6rem; }
    .lista { list-style: none; margin: 0; padding: 0; }
    .lista li { display: flex; align-items: center; gap: .7rem; padding: .6rem .3rem; border-top: 1px solid var(--borde); flex-wrap: wrap; }
    .lista li:first-child { border-top: 0; }
    .lista li:hover { background: var(--gris); }
    .texto { flex: 1 1 16rem; min-width: 0; display: grid; }
    .texto a { color: inherit; text-decoration: none; overflow-wrap: anywhere; }
    .texto a:hover { text-decoration: underline; }
    .texto small { font-size: .84rem; }
  `,
})
export class MapaJuridico implements AfterViewInit {
  private readonly expedientes = inject(ExpedientesService);
  private readonly flujo = inject(FlujoService);
  private readonly router = inject(Router);
  private readonly lienzo = viewChild.required<ElementRef<HTMLDivElement>>('lienzo');
  protected readonly COLOR = COLOR;

  private mapa?: L.Map;
  private readonly capa = L.layerGroup();
  private readonly marcadores = new Map<string, L.CircleMarker>();
  private readonly listo = signal(false);

  protected readonly puntos = computed<Punto[]>(() => {
    const validaciones = this.flujo.validaciones();
    const tareas = this.flujo.tareas();
    return this.expedientes.lista().map((exp) => {
      const d = exp.dictamen;
      let municipio = '';
      for (const datos of Object.values(d?.datos ?? {})) {
        const m = datos.find((x) => x.nombre === 'municipio' && x.valor)?.valor;
        if (m) { municipio = m; break; }
      }
      const base = MUNICIPIOS[normalizar(municipio)] ?? null;
      return {
        exp, titulo: ExpedientesService.titulo(exp), estado: ExpedientesService.estado(exp), municipio: municipio || 'Municipio sin identificar',
        coords: base ? desplazar(exp.id, base) : null,
        hallazgos: d?.hallazgos.length ?? 0,
        validacion: d ? estadoValidacion(exp, validaciones).texto : 'Sin dictamen',
        pendientes: tareas.filter((t) => t.exp === exp.id && t.estado !== 'resuelto').length,
      };
    });
  });
  protected readonly ubicados = computed(() => this.puntos().filter((p) => p.coords));
  protected readonly sinUbicar = computed(() => this.puntos().filter((p) => !p.coords));

  constructor() {
    this.expedientes.refrescar();
    effect(() => { if (this.listo()) this.dibujar(this.ubicados()); });
    inject(DestroyRef).onDestroy(() => this.mapa?.remove());
  }

  ngAfterViewInit(): void {
    this.mapa = L.map(this.lienzo().nativeElement, { scrollWheelZoom: true }).setView([19.95, -99.25], 9);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 17, attribution: '&copy; colaboradores de OpenStreetMap',
    }).addTo(this.mapa);
    this.capa.addTo(this.mapa);
    this.listo.set(true);
    setTimeout(() => this.mapa?.invalidateSize(), 200);
  }

  private dibujar(puntos: Punto[]): void {
    if (!this.mapa) return;
    this.capa.clearLayers();
    this.marcadores.clear();
    for (const p of puntos) {
      const marcador = L.circleMarker(p.coords!, {
        radius: 10, color: '#fff', weight: 2, fillColor: COLOR[p.estado], fillOpacity: 0.95,
      });
      marcador.bindTooltip(this.etiqueta(p), { direction: 'top', offset: [0, -8], opacity: 1, className: 'tip-inmueble' });
      marcador.on('click', () => this.router.navigate(['/juridico/expediente', p.exp.id]));
      marcador.addTo(this.capa);
      this.marcadores.set(p.exp.id, marcador);
    }
    if (puntos.length) {
      this.mapa.fitBounds(L.latLngBounds(puntos.map((p) => p.coords!)).pad(0.35), { maxZoom: 11 });
    }
  }

  /** Contenido del globo. Se arma con nodos y textContent: los títulos vienen de documentos subidos. */
  private etiqueta(p: Punto): HTMLElement {
    const nodo = (etiqueta: string, clase: string, texto = ''): HTMLElement => {
      const e = document.createElement(etiqueta);
      e.className = clase;
      e.textContent = texto;
      return e;
    };
    const caja = nodo('div', 'tip-caja');
    caja.appendChild(nodo('div', 'tip-titulo', p.titulo));

    const estado = nodo('span', 'tip-estado', p.estado);
    estado.style.background = COLOR[p.estado];
    caja.appendChild(estado);

    const filas = nodo('dl', 'tip-filas');
    const fila = (rotulo: string, valor: string) => {
      filas.appendChild(nodo('dt', '', rotulo));
      filas.appendChild(nodo('dd', '', valor));
    };
    fila('Hallazgos', String(p.hallazgos));
    fila('Jurídico', p.validacion);
    if (p.pendientes) fila('Pendientes', `${p.pendientes} abierto${p.pendientes === 1 ? '' : 's'}`);
    fila('Municipio', p.municipio);
    fila('Recibido', fecha(p.exp.fecha, false));
    caja.appendChild(filas);
    caja.appendChild(nodo('div', 'tip-pie', 'Clic para abrir el expediente'));
    return caja;
  }

  /** Al pasar por la lista, se agranda su punto en el mapa. */
  protected resaltar(id: string | null): void {
    for (const [clave, m] of this.marcadores) {
      m.setStyle({ radius: clave === id ? 15 : 10, weight: clave === id ? 4 : 2 });
      if (clave === id) m.openTooltip(); else m.closeTooltip();
    }
  }
}
