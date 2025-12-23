const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { format } = require("date-fns");

const round2 = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

// Export dashboard data to Excel
exports.exportToExcel = async (req, res) => {
  try {
    const dashboardData = req.body.data; // Frontend sends dashboard data

    if (!dashboardData) {
      return res.status(400).json({ error: "Dashboard data is required" });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Kushal Finance";
    workbook.created = new Date();

    // Overview Sheet
    const overviewSheet = workbook.addWorksheet("Overview");
    overviewSheet.columns = [
      { header: "Metric", key: "metric", width: 30 },
      { header: "Current Period", key: "current", width: 20 },
      { header: "Previous Period", key: "previous", width: 20 },
      { header: "Change (%)", key: "change", width: 15 },
    ];

    // Add header styling
    overviewSheet.getRow(1).font = { bold: true, size: 12 };
    overviewSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    overviewSheet.getRow(1).font.color = { argb: "FFFFFFFF" };

    // Add date range info
    overviewSheet.addRow([
      "Date Range",
      dashboardData.dateRange?.current?.label || "N/A",
      dashboardData.dateRange?.previous?.label || "N/A",
      "",
    ]);
    overviewSheet.addRow([
      "Scope",
      dashboardData.scope?.level || "N/A",
      "",
      "",
    ]);
    overviewSheet.addRow([]); // Empty row

    // KPIs
    const kpis = dashboardData.kpis;
    if (kpis) {
      overviewSheet.addRow([
        "Disbursement Count",
        kpis.disbursement?.current?.count || 0,
        kpis.disbursement?.previous?.count || 0,
        kpis.disbursement?.change?.percentage || 0,
      ]);
      overviewSheet.addRow([
        "Disbursement Amount",
        kpis.disbursement?.current?.amount || 0,
        kpis.disbursement?.previous?.amount || 0,
        kpis.disbursement?.change?.percentage || 0,
      ]);
      overviewSheet.addRow([
        "Collection Count",
        kpis.collection?.current?.count || 0,
        kpis.collection?.previous?.count || 0,
        kpis.collection?.change?.percentage || 0,
      ]);
      overviewSheet.addRow([
        "Collection Amount",
        kpis.collection?.current?.amount || 0,
        kpis.collection?.previous?.amount || 0,
        kpis.collection?.change?.percentage || 0,
      ]);
      overviewSheet.addRow([
        "Collection Efficiency (%)",
        kpis.collectionEfficiency?.current?.efficiency || 0,
        kpis.collectionEfficiency?.previous?.efficiency || 0,
        kpis.collectionEfficiency?.change?.efficiency || 0,
      ]);
      overviewSheet.addRow([
        "Active Loans",
        kpis.activeLoans || 0,
        "",
        "",
      ]);
      overviewSheet.addRow([
        "Overdue Loans",
        kpis.overdueLoans || 0,
        "",
        "",
      ]);
      overviewSheet.addRow([
        "Pending Approvals",
        kpis.pendingApprovals || 0,
        "",
        "",
      ]);
    }

    // Portfolio Quality Sheet
    const portfolioSheet = workbook.addWorksheet("Portfolio Quality");
    portfolioSheet.columns = [
      { header: "Metric", key: "metric", width: 30 },
      { header: "Value", key: "value", width: 20 },
    ];

    portfolioSheet.getRow(1).font = { bold: true, size: 12 };
    portfolioSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF70AD47" },
    };
    portfolioSheet.getRow(1).font.color = { argb: "FFFFFFFF" };

    // NPA Data
    const npa = dashboardData.portfolioQuality?.npa;
    if (npa) {
      portfolioSheet.addRow(["NPA Count", npa.npaCount || 0]);
      portfolioSheet.addRow(["NPA Amount", npa.npaAmount || 0]);
      portfolioSheet.addRow(["Total Portfolio", npa.totalPortfolio || 0]);
      portfolioSheet.addRow(["NPA Ratio (%)", npa.npaRatio || 0]);
      portfolioSheet.addRow([]); // Empty row
    }

    // DPD Buckets
    portfolioSheet.addRow(["DPD Bucket", "Count", "Amount"]);
    portfolioSheet.getRow(portfolioSheet.lastRow.number).font = { bold: true };

    const dpd = dashboardData.portfolioQuality?.dpd;
    if (dpd && Array.isArray(dpd)) {
      dpd.forEach((bucket) => {
        portfolioSheet.addRow([
          bucket.bucket,
          bucket.count || 0,
          bucket.amount || 0,
        ]);
      });
    }

    // Operational Metrics Sheet
    const operationalSheet = workbook.addWorksheet("Operational Metrics");
    operationalSheet.columns = [
      { header: "Metric", key: "metric", width: 30 },
      { header: "Current Period", key: "current", width: 20 },
      { header: "Previous Period", key: "previous", width: 20 },
      { header: "Change", key: "change", width: 15 },
    ];

    operationalSheet.getRow(1).font = { bold: true, size: 12 };
    operationalSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFC000" },
    };
    operationalSheet.getRow(1).font.color = { argb: "FFFFFFFF" };

    const operational = dashboardData.operational;
    if (operational) {
      operationalSheet.addRow([
        "Total Applications",
        operational.current?.totalApplications || 0,
        operational.previous?.totalApplications || 0,
        operational.change?.applications || 0,
      ]);
      operationalSheet.addRow([
        "Approved Loans",
        operational.current?.approvedLoans || 0,
        operational.previous?.approvedLoans || 0,
        "",
      ]);
      operationalSheet.addRow([
        "Rejected Loans",
        operational.current?.rejectedLoans || 0,
        "",
        "",
      ]);
      operationalSheet.addRow([
        "Approval Rate (%)",
        operational.current?.approvalRate || 0,
        operational.previous?.approvalRate || 0,
        operational.change?.approvalRate || 0,
      ]);
    }

    // Set response headers
    const filename = `Dashboard_Report_${format(
      new Date(),
      "yyyy-MM-dd_HHmmss"
    )}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Excel export error:", error);
    return res.status(500).json({ error: "Failed to export to Excel" });
  }
};

// Export dashboard data to PDF
exports.exportToPDF = async (req, res) => {
  try {
    const dashboardData = req.body.data; // Frontend sends dashboard data

    if (!dashboardData) {
      return res.status(400).json({ error: "Dashboard data is required" });
    }

    const doc = new PDFDocument({ margin: 50, size: "A4" });

    // Set response headers
    const filename = `Dashboard_Report_${format(
      new Date(),
      "yyyy-MM-dd_HHmmss"
    )}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Pipe to response
    doc.pipe(res);

    // Title
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("Dashboard Report", { align: "center" });
    doc.moveDown();

    // Date Range
    doc
      .fontSize(12)
      .font("Helvetica")
      .text(
        `Current Period: ${dashboardData.dateRange?.current?.label || "N/A"}`
      );
    doc.text(
      `Previous Period: ${dashboardData.dateRange?.previous?.label || "N/A"}`
    );
    doc.text(`Scope: ${dashboardData.scope?.level || "N/A"}`);
    doc.moveDown();

    // Horizontal line
    doc
      .strokeColor("#4472C4")
      .lineWidth(2)
      .moveTo(50, doc.y)
      .lineTo(550, doc.y)
      .stroke();
    doc.moveDown();

    // KPIs Section
    doc.fontSize(16).font("Helvetica-Bold").text("Key Performance Indicators");
    doc.moveDown(0.5);

    const kpis = dashboardData.kpis;
    if (kpis) {
      doc.fontSize(10).font("Helvetica");

      const addKPI = (label, current, previous, change) => {
        doc.font("Helvetica-Bold").text(label, { continued: false });
        doc
          .font("Helvetica")
          .text(
            `  Current: ${current}  |  Previous: ${previous}  |  Change: ${change}`,
            { indent: 20 }
          );
        doc.moveDown(0.3);
      };

      addKPI(
        "Disbursement",
        `${kpis.disbursement?.current?.count || 0} loans, ₹${
          kpis.disbursement?.current?.amount || 0
        }`,
        `${kpis.disbursement?.previous?.count || 0} loans, ₹${
          kpis.disbursement?.previous?.amount || 0
        }`,
        `${kpis.disbursement?.change?.percentage || 0}%`
      );

      addKPI(
        "Collection",
        `${kpis.collection?.current?.count || 0} payments, ₹${
          kpis.collection?.current?.amount || 0
        }`,
        `${kpis.collection?.previous?.count || 0} payments, ₹${
          kpis.collection?.previous?.amount || 0
        }`,
        `${kpis.collection?.change?.percentage || 0}%`
      );

      addKPI(
        "Collection Efficiency",
        `${kpis.collectionEfficiency?.current?.efficiency || 0}%`,
        `${kpis.collectionEfficiency?.previous?.efficiency || 0}%`,
        `${kpis.collectionEfficiency?.change?.efficiency || 0}%`
      );

      doc.text(`Active Loans: ${kpis.activeLoans || 0}`);
      doc.text(`Overdue Loans: ${kpis.overdueLoans || 0}`);
      doc.text(`Pending Approvals: ${kpis.pendingApprovals || 0}`);
    }

    doc.moveDown();

    // Portfolio Quality Section
    doc
      .strokeColor("#70AD47")
      .lineWidth(2)
      .moveTo(50, doc.y)
      .lineTo(550, doc.y)
      .stroke();
    doc.moveDown();

    doc.fontSize(16).font("Helvetica-Bold").text("Portfolio Quality");
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica");

    const npa = dashboardData.portfolioQuality?.npa;
    if (npa) {
      doc.text(`NPA Count: ${npa.npaCount || 0}`);
      doc.text(`NPA Amount: ₹${npa.npaAmount || 0}`);
      doc.text(`Total Portfolio: ₹${npa.totalPortfolio || 0}`);
      doc.text(`NPA Ratio: ${npa.npaRatio || 0}%`);
      doc.moveDown(0.5);
    }

    // DPD Buckets
    doc.font("Helvetica-Bold").text("Days Past Due (DPD) Distribution:");
    doc.moveDown(0.3);
    doc.font("Helvetica");

    const dpd = dashboardData.portfolioQuality?.dpd;
    if (dpd && Array.isArray(dpd)) {
      dpd.forEach((bucket) => {
        doc.text(
          `  ${bucket.bucket} days: ${bucket.count || 0} loans, ₹${
            bucket.amount || 0
          }`
        );
      });
    }

    doc.moveDown();

    // Operational Metrics Section
    doc
      .strokeColor("#FFC000")
      .lineWidth(2)
      .moveTo(50, doc.y)
      .lineTo(550, doc.y)
      .stroke();
    doc.moveDown();

    doc.fontSize(16).font("Helvetica-Bold").text("Operational Metrics");
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica");

    const operational = dashboardData.operational;
    if (operational) {
      doc.text(
        `Total Applications: ${
          operational.current?.totalApplications || 0
        } (Previous: ${operational.previous?.totalApplications || 0})`
      );
      doc.text(`Approved Loans: ${operational.current?.approvedLoans || 0}`);
      doc.text(`Rejected Loans: ${operational.current?.rejectedLoans || 0}`);
      doc.text(
        `Approval Rate: ${
          operational.current?.approvalRate || 0
        }% (Previous: ${operational.previous?.approvalRate || 0}%)`
      );
    }

    // Footer
    doc.moveDown(2);
    doc
      .fontSize(8)
      .font("Helvetica")
      .text(
        `Generated on ${format(new Date(), "MMMM dd, yyyy 'at' hh:mm a")}`,
        { align: "center" }
      );

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error("PDF export error:", error);
    return res.status(500).json({ error: "Failed to export to PDF" });
  }
};
