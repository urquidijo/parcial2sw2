package com.proptech.contracts.contract.application.port.in;

import com.proptech.contracts.model.Contract;

import java.util.List;

/** HEXAGONAL — Puerto de entrada: consultar contratos (el cliente ve solo los suyos). */
public interface QueryContractsUseCase {
    List<Contract> list(Caller caller);
    Contract getVisible(Long id, Caller caller);
}
