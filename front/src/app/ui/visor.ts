// Visor de evidencia: la página que leyó el OCR con el fragmento resaltado encima.
// La imagen la sirve el back (ya enderezada); la caja viene normalizada de 0 a 1, así que el
// resaltado se dibuja con porcentajes y no depende del tamaño en pantalla.
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, signal, viewChild } from '@angular/core';
import { Documento, Evidencia } from '../core/modelos';
import { Fragmento } from './ui';

@Component({
  selector: 'app-visor',
  imports: [Fragmento],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ev(); as e) {
      <p class="titulo"><b>{{ documento()?.tipo ?? 'Documento' }}</b>&ngsp;<span class="suave">({{ documento()?.archivo }}), página {{ e.pagina }}</span></p>
      <app-fragmento [ev]="e" origen="Fragmento citado" />
      @if (fallo()) {
        <div class="aviso info"><span class="ms" aria-hidden="true">image_not_supported</span>
          No se pudo obtener la página del servicio de análisis, así que solo se muestra el fragmento citado.</div>
      } @else {
        <figure class="pagina">
          <img [src]="url()" [alt]="'Página ' + e.pagina + ' de ' + (documento()?.archivo ?? 'el documento')"
               (load)="cargada()" (error)="fallo.set(true)">
          @if (e.caja; as c) {
            <span #marca class="marca" aria-hidden="true"
                  [style.left.%]="c[0] * 100" [style.top.%]="c[1] * 100"
                  [style.width.%]="(c[2] - c[0]) * 100" [style.height.%]="(c[3] - c[1]) * 100"></span>
          }
        </figure>
        @if (!e.caja) { <p class="suave pequeno">Esta evidencia no trae la ubicación exacta; revisa la página completa.</p> }
      }
    } @else {
      <div class="vacio">
        <span class="ms" aria-hidden="true">plagiarism</span>
        <p class="suave">Elige «Ver en el documento» en cualquier hallazgo o dato para ver aquí la página original con el fragmento resaltado.</p>
      </div>
    }
  `,
  styles: `
    :host { display: grid; gap: .75rem; }
    .titulo { overflow-wrap: anywhere; }
    .pagina { position: relative; margin: 0; border: 1px solid var(--borde); border-radius: var(--radio-s); overflow: hidden; background: #fff; }
    .pagina img { display: block; width: 100%; height: auto; }
    .marca { position: absolute; background: rgba(255, 209, 51, .35); outline: 2px solid #2B4D7D; outline-offset: 2px; border-radius: 2px; }
    .vacio { display: grid; justify-items: center; text-align: center; gap: .5rem; padding: 2rem 1rem; }
    .vacio .ms { font-size: 2.4rem; color: var(--borde-fuerte); }
  `,
})
export class Visor {
  readonly ev = input<Evidencia | null>(null);
  readonly documento = input<Documento | undefined>(undefined);
  readonly urlBase = input.required<(backId: string, docId: string, pagina: number) => string>();
  protected readonly fallo = signal(false);
  private readonly marca = viewChild<ElementRef<HTMLElement>>('marca');

  protected readonly url = computed(() => {
    const e = this.ev(), d = this.documento();
    return e && d ? this.urlBase()(d.backId, d.id, e.pagina) : '';
  });

  constructor() {
    effect(() => { this.url(); this.fallo.set(false); });
  }

  protected cargada(): void {
    this.marca()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }
}
