import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { accessToken, apiUrl } from './habitat-bridge';

interface GraphqlResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

// Cliente GraphQL del ERP: todas las vistas consultan el BFF (/api/graphql) con el token de Keycloak.
@Injectable({ providedIn: 'root' })
export class GraphqlService {
  private readonly http = inject(HttpClient);

  async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const token = accessToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    try {
      const body = await firstValueFrom(this.http.post<GraphqlResponse<T>>(`${apiUrl()}/graphql`, { query, variables }, { headers }));
      if (body.errors?.length) {
        throw new Error(body.errors.map((e) => e.message).join('. '));
      }
      return body.data as T;
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        const payload = err.error;
        throw new Error(payload?.errors?.[0]?.message || payload?.message || `Error ${err.status} al consultar el ERP`);
      }
      throw err;
    }
  }
}
