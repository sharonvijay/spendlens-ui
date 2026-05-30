import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common'; // Needed for basic Angular directives like *ngIf
import { BaseChartDirective } from 'ng2-charts'; // The chart module
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true, // Make sure this is here!
  imports: [CommonModule, BaseChartDirective], // Import the modules here
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  title = 'SpendLens';

  // State Management
  selectedFile: File | null = null;
  isLoading = false;
  analysisData: any = null;
  errorMessage: string = '';

  // Chart Data Configurations
  categoryChartData!: ChartData<'doughnut'>;
  categoryChartType: ChartType = 'doughnut';

  // Register the plugin for the template
  pieChartPlugins = [ChartDataLabels];

  // Configure the chart options and the datalabels plugin
  categoryChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom', // Moves the legend to the bottom so it fits mobile better
      },
      datalabels: {
        color: '#ffffff', // White text on the slices
        font: {
          weight: 'bold',
          size: 12,
        },
        formatter: (value: any, ctx: any) => {
          // Calculate the total sum of all slices
          let sum = 0;
          let dataArr = ctx.chart.data.datasets[0].data;
          dataArr.map((data: number) => {
            sum += data;
          });
          // Return the percentage
          let percentage = ((value * 100) / sum).toFixed(1) + '%';

          // Hide the label if the slice is too small (e.g., less than 5%)
          if ((value * 100) / sum < 5) {
            return null;
          }
          return percentage;
        },
      },
    },
  };

  weeklyChartData!: ChartData<'bar'>;
  weeklyChartType: ChartType = 'bar';

  constructor(private http: HttpClient) {}

  // Handle file selection from the input
  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        this.errorMessage = 'Please select a valid PDF file.';
        this.selectedFile = null;
        return;
      }
      this.selectedFile = file;
      this.errorMessage = '';
    }
  }

  // Trigger the upload to Spring Boot
  onUpload() {
    if (!this.selectedFile) return;

    this.isLoading = true;
    this.errorMessage = '';

    const formData = new FormData();
    formData.append('file', this.selectedFile);

    // Ensure your Spring Boot app is running on 8080!
    this.http
      this.http
        .post(`${environment.apiUrl}/api/v1/statements/analyze`, formData)
        .subscribe({
          next: (response) => {
            this.analysisData = response;
            this.processChartData(); // Format the JSON for Chart.js
            this.isLoading = false;
          },
          error: (error) => {
            console.error(error);
            this.errorMessage =
              'Failed to analyze the statement. Check the console.';
            this.isLoading = false;
          },
        });
  }

  // Process the raw JSON into Chart.js format
  processChartData() {
    if (!this.analysisData) return;

    // 1. Process Category Donut Chart
    const categories = Object.keys(this.analysisData.categoryBreakdown);
    const amounts = Object.values(
      this.analysisData.categoryBreakdown,
    ) as number[];

    this.categoryChartData = {
      labels: categories,
      datasets: [
        {
          data: amounts,
          backgroundColor: [
            '#4c72b0',
            '#dd8452',
            '#55a868',
            '#c44e52',
            '#8172b2',
            '#937860',
          ],
        },
      ],
    };

    // 2. Process Weekly Bar Chart (Stacked)
    const weekLabels = this.analysisData.weeklyData.map(
      (w: any) => `Week ${w.weekNumber}`,
    );
    const weekdaySpend = this.analysisData.weeklyData.map(
      (w: any) => w.weekdaySpend,
    );
    const weekendSpend = this.analysisData.weeklyData.map(
      (w: any) => w.weekendSpend,
    );

    this.weeklyChartData = {
      labels: weekLabels,
      datasets: [
        {
          data: weekdaySpend,
          label: 'Weekday Spend',
          backgroundColor: '#4c72b0',
        },
        {
          data: weekendSpend,
          label: 'Weekend Spend',
          backgroundColor: '#dd8452',
        },
      ],
    };
  }

  // Handle the Excel Export
  onExportExcel() {
    if (!this.analysisData) return;

    this.http
      .post(
        'http://localhost:8080/api/v1/statements/export',
        this.analysisData,
        {
          responseType: 'blob', // Crucial for downloading files!
        },
      )
      .subscribe((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SpendLens_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      });
  }
}