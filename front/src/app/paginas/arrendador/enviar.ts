import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CuentasService } from '../../core/cuentas.service';
import { ExpedientesService } from '../../core/expedientes.service';
import { TipoDocumento } from '../../core/modelos';
import { AsistenteCarga } from '../../ui/asistente-carga';
import { Encabezado } from '../../ui/ui';

@Component({
  selector: 'app-enviar',
  imports: [Encabezado, AsistenteCarga, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-encabezado icono="upload_file" titulo="Enviar documentos"
      descripcion="Sube los cuatro documentos de tu inmueble, uno por paso. Si aún no tienes alguno, continúa y envíalo después." />

    @if (folio(); as f) {
      <section class="tarjeta listo" role="status">
        <span class="icono-caja verde"><span class="ms" aria-hidden="true">check</span></span>
        <div class="texto">
          <h2>Documentos enviados</h2>
          <p class="suave">Folio {{ f }}. Tiendas 3B revisará tus documentos; consulta el avance en «Mis trámites».</p>
          <div class="fila acciones">
            <a class="btn primario" routerLink="/arrendador/tramites"><span class="ms" aria-hidden="true">folder_shared</span>Ver mis trámites</a>
            <button type="button" class="btn" (click)="folio.set(null)"><span class="ms" aria-hidden="true">add</span>Enviar otro inmueble</button>
          </div>
        </div>
      </section>
    } @else {
      @if (error()) { <div class="aviso error" role="alert"><span class="ms" aria-hidden="true">error</span>{{ error() }}</div> }
      <app-asistente-carga etiquetaEnvio="Enviar documentos" iconoEnvio="send" [ocupado]="ocupado()" (enviar)="enviar($event)" />
    }
  `,
  styles: `
    .listo { display: flex; gap: 1rem; align-items: flex-start; padding: 1.5rem; }
    .verde { background: var(--verde); color: var(--texto); }
    h2 { font-size: 1.3rem; }
    .texto p { margin-top: .25rem; }
    .acciones { margin-top: 1rem; }
    .aviso { margin-bottom: 1rem; }
  `,
})
export class Enviar {
  private readonly cuentas = inject(CuentasService);
  private readonly expedientes = inject(ExpedientesService);
  private readonly asistente = viewChild(AsistenteCarga);

  protected readonly folio = signal<string | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');

  protected async enviar(docs: Partial<Record<TipoDocumento, File[]>>): Promise<void> {
    this.ocupado.set(true);
    this.error.set('');
    try {
      const exp = await this.expedientes.recibir(docs, 'arrendador', this.cuentas.cuenta()!.usuario);
      // Si el back está encendido, el análisis arranca ya; si no, 3B lo lanza desde su bandeja.
      if (await this.expedientes.revisarConexion(true)) {
        await this.expedientes.iniciarAnalisis(exp.id).catch(() => undefined);
      }
      this.asistente()?.reiniciar();
      this.folio.set(exp.id);
    } catch (e) {
      this.error.set(`No se pudieron guardar los documentos: ${(e as Error).message}. Inténtalo de nuevo.`);
    } finally {
      this.ocupado.set(false);
    }
  }
}
