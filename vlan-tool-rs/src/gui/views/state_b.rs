//! Tillstånd för flikarna Portar, VLAN, Topologi, Drift, CSV-data, Subnät och
//! Inställningar samt mappväljaren. Lagras i `App::sb`.

use super::{
    csv::CsvState, drift::DriftState, export::ExportState, ports::PortsState, subnet::SubnetState, topo::TopoState, vlans::VlansState,
};

#[derive(Default)]
pub struct StateB {
    pub(crate) ports: PortsState,
    pub(crate) vlans: VlansState,
    pub(crate) topo: TopoState,
    pub(crate) drift: DriftState,
    pub(crate) csv: CsvState,
    pub(crate) subnet: SubnetState,
    pub(crate) export: ExportState,
}
