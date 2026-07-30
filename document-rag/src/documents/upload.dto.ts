// upload.dto.ts
// Describes the shape of data coming into POST /documents/upload.
// The file itself is handled by Multer's FileInterceptor.
// This DTO is the extension point for future fields (e.g. tags, description).

export class UploadDto {
  // Currently empty — file validation is done by ParseFilePipe in the controller.
  // Add optional metadata fields here as the API grows.
}
