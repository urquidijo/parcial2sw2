package com.proptech.contracts;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class MsContractsApplication {

    public static void main(String[] args) {
        SpringApplication.run(MsContractsApplication.class, args);
        System.out.println("=======================================================");
        System.out.println("🚀 [ms-contracts-spring] escuchando en http://localhost:8081");
        System.out.println("📊 Conectado a PostgreSQL (BD: contracts_db, Tabla: contracts)");
        System.out.println("=======================================================");
    }
}
